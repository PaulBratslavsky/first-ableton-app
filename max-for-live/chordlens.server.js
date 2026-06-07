/**
 * ChordLens — WebSocket bridge (runs inside the Max `node.script` object).
 *
 * DEPENDENCY-FREE: implements WebSocket (RFC 6455) with only Node's built-in
 * `http` + `crypto`. No `ws`, no `node_modules` — so nothing can be "not found"
 * when Ableton copies the device, and freezing bundles just this .js file.
 *
 * It hosts a WebSocket server the ChordLens app connects to, and bridges to the
 * `v8` object (chordlens.v8.js) for Live API access.
 *
 *   MIDI:     [midiin]→[midiparse]→[prepend note]→ node →(broadcast)→ app
 *   Live→app: v8 →"fromlive <json>"→ node →(broadcast)→ app
 *   app→Live: app →(ws)→ node →"cmd <json>"→ v8
 *
 * Protocol (JSON, one object per message):
 *   Device → app:  {type:"hello",port} | {type:"note",pitch,velocity}
 *                  {type:"transport",isPlaying} | {type:"tempo",tempo}
 *                  {type:"session",session} | {type:"pong"} | {type:"error",...}
 *                  command replies: {id,ok,result} | {id,error}
 *   App → device:  {id?,type,...params}  e.g. {type:"set_tempo",tempo:128}
 */

const Max = require('max-api');
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.CHORDLENS_WS_PORT) || 17999;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const clients = new Set(); // raw TCP sockets, upgraded to WebSocket
let lastSession = null;
let lastTransport = null;

// ── WebSocket framing (RFC 6455) ──────────────────────────────────────────

/** Encode a server→client frame (unmasked). opcode: 0x1 text, 0x9 ping, 0xA pong, 0x8 close. */
function encodeFrame(payload, opcode) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
    header.writeUInt32BE(len >>> 0, 6);
  }
  return Buffer.concat([header, payload]);
}

/** Pull one frame off `buf`; returns { opcode, payload, rest } or null if incomplete. */
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < offset + 2) return null;
    len = buf.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (buf.length < offset + 8) return null;
    len = buf.readUInt32BE(offset) * 0x100000000 + buf.readUInt32BE(offset + 4);
    offset += 8;
  }
  let maskKey = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.slice(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;
  let payload = buf.slice(offset, offset + len);
  if (masked) {
    const out = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
    payload = out;
  }
  return { opcode, payload, rest: buf.slice(offset + len) };
}

function sendText(socket, str) {
  if (socket.writable) {
    try {
      socket.write(encodeFrame(Buffer.from(str, 'utf8'), 0x1));
    } catch (e) {
      clients.delete(socket);
    }
  }
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const s of clients) sendText(s, data);
}

/** Forward a command to the v8 object: cmd <jsonString>. */
function toLive(obj) {
  Max.outlet('cmd', JSON.stringify(obj));
}

// ── HTTP server + WebSocket upgrade ───────────────────────────────────────

const server = http.createServer((req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Upgrade Required');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' +
      accept +
      '\r\n\r\n',
  );
  onConnect(socket);
});

server.on('error', (err) => {
  Max.post(`ChordLens WebSocket error: ${err.message}`, Max.POST_LEVELS.ERROR);
});

server.listen(PORT, '127.0.0.1', () => {
  Max.post(`ChordLens WebSocket listening on ws://127.0.0.1:${PORT}`);
});

function onConnect(socket) {
  socket.isAlive = true;
  clients.add(socket);
  Max.post(`ChordLens client connected (${clients.size} total)`);

  // Greet + replay cached state, then ask v8 for a fresh snapshot.
  sendText(socket, JSON.stringify({ type: 'hello', port: PORT }));
  if (lastSession) sendText(socket, JSON.stringify({ type: 'session', session: lastSession }));
  if (lastTransport) sendText(socket, JSON.stringify(lastTransport));
  toLive({ type: 'get_session' });

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const frame = decodeFrame(buf);
      if (!frame) break;
      buf = frame.rest;
      handleFrame(socket, frame);
    }
  });
  socket.on('close', () => {
    clients.delete(socket);
    Max.post(`ChordLens client disconnected (${clients.size} total)`);
  });
  socket.on('error', () => clients.delete(socket));
}

function handleFrame(socket, frame) {
  const { opcode, payload } = frame;
  socket.isAlive = true;
  if (opcode === 0x8) {
    // close
    try {
      socket.end(encodeFrame(Buffer.alloc(0), 0x8));
    } catch (e) {
      /* already gone */
    }
    clients.delete(socket);
    return;
  }
  if (opcode === 0x9) {
    // ping → pong
    try {
      socket.write(encodeFrame(payload, 0xa));
    } catch (e) {
      clients.delete(socket);
    }
    return;
  }
  if (opcode === 0xa) return; // pong — already marked alive
  if (opcode !== 0x1) return; // ignore binary / continuation

  let msg;
  try {
    msg = JSON.parse(payload.toString('utf8'));
  } catch (e) {
    sendText(socket, JSON.stringify({ type: 'error', message: 'bad json' }));
    return;
  }
  if (msg.type === 'ping') {
    sendText(socket, JSON.stringify({ type: 'pong' }));
    return;
  }
  toLive(msg);
}

// Drop clients that stop answering pings (half-open sockets).
const keepAlive = setInterval(() => {
  for (const s of clients) {
    if (s.isAlive === false) {
      clients.delete(s);
      try {
        s.destroy();
      } catch (e) {
        /* ignore */
      }
      continue;
    }
    s.isAlive = false;
    try {
      s.write(encodeFrame(Buffer.alloc(0), 0x9)); // protocol ping
    } catch (e) {
      clients.delete(s);
    }
  }
}, 10000);
server.on('close', () => clearInterval(keepAlive));

// ── Inbound from the Max patch ────────────────────────────────────────────

// MIDI note from [midiin]→[midiparse]→[prepend note]:  note <pitch> <velocity>
Max.addHandler('note', (pitch, velocity) => {
  broadcast({ type: 'note', pitch: Number(pitch), velocity: Number(velocity) });
});

// Events/replies from the v8 Live API bridge:  fromlive <jsonString>
Max.addHandler('fromlive', (jsonStr) => {
  let obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    Max.post(`bad fromlive json: ${e.message}`, Max.POST_LEVELS.ERROR);
    return;
  }
  if (obj.type === 'session' && obj.session) lastSession = obj.session;
  if (obj.type === 'transport') lastTransport = obj;
  broadcast(obj);
});

// Never let a stray error take the server (and the bridge) down.
process.on('uncaughtException', (err) => {
  Max.post(`ChordLens uncaught: ${err.message}`, Max.POST_LEVELS.ERROR);
});
process.on('unhandledRejection', (reason) => {
  Max.post(`ChordLens unhandled rejection: ${reason}`, Max.POST_LEVELS.ERROR);
});

Max.post('ChordLens node bridge loaded (dependency-free).');
