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
 * ── One device per track, one app ─────────────────────────────────────────
 *
 * Drop the device on several tracks and every copy runs its own copy of this
 * script, all wanting port 17999. Rather than the first one winning and the
 * rest failing silently, they elect a hub:
 *
 *   hub        bound the port. Serves the app, and relays for the satellites.
 *   satellite  port was taken, so it connects to the hub as a client and
 *              forwards its own track's notes through it.
 *
 * The app therefore sees every track through one connection, with each note
 * stamped with the track it came from. If the hub's device is removed the port
 * frees up, and whichever satellite notices first takes over.
 *
 * Protocol (JSON, one object per message):
 *   Device → app:  {type:"hello",port,role} | {type:"note",pitch,velocity,track}
 *                  {type:"tracks",tracks:[…]} | {type:"transport",isPlaying}
 *                  {type:"tempo",tempo} | {type:"session",session}
 *                  {type:"pong"} | {type:"error",...}
 *                  command replies: {id,ok,result} | {id,error}
 *   App → device:  {id?,type,...params}  e.g. {type:"set_tempo",tempo:128}
 */

const Max = require('max-api');
const http = require('http');
const crypto = require('crypto');
const net = require('net');

const PORT = Number(process.env.CHORDLENS_WS_PORT) || 17999;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** How long a satellite waits before checking whether the hub has gone. */
const REELECT_MS = 2000;

const clients = new Set(); // raw TCP sockets, upgraded to WebSocket
let lastSession = null;
let lastTransport = null;

/** 'hub' once we own the port, 'satellite' when another device already does. */
let role = 'starting';
/** This device's own track, from the v8 Live API bridge. */
let myTrack = null;
/**
 * The track each device reports, keyed by the device — `SELF` for our own, the
 * satellite's socket for the others.
 *
 * Keyed by device rather than by track index on purpose: a device's index moves
 * whenever tracks are added, deleted or reordered in Live, and keying by index
 * would leave the old number in the roster forever. One device, one slot.
 */
const trackByDevice = new Map();
const SELF = Symbol('this device');
/** A satellite's connection to the hub. */
let hubSocket = null;
let reelectTimer = null;

// ── WebSocket framing (RFC 6455) ──────────────────────────────────────────

/**
 * Encode one frame. opcode: 0x1 text, 0x9 ping, 0xA pong, 0x8 close.
 * Client→server frames must be masked; server→client frames must not be.
 */
function encodeFrame(payload, opcode, masked) {
  const len = payload.length;
  const flag = masked ? 0x80 : 0x00;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, flag | len]);
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = flag | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = flag | 127;
    header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
    header.writeUInt32BE(len >>> 0, 6);
  }
  if (!masked) return Buffer.concat([header, payload]);

  const key = crypto.randomBytes(4);
  const body = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) body[i] = payload[i] ^ key[i & 3];
  return Buffer.concat([header, key, body]);
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

function sendText(socket, str, masked) {
  if (socket && socket.writable) {
    try {
      socket.write(encodeFrame(Buffer.from(str, 'utf8'), 0x1, masked));
    } catch (e) {
      clients.delete(socket);
    }
  }
}

/** Send to the app(s). Satellites are peers, not an audience — skip them. */
function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const s of clients) {
    if (!s.isSatellite) sendText(s, data, false);
  }
}

/**
 * Emit a note or track announcement. The hub sends it to the app; a satellite
 * sends it up to the hub, which relays it on our behalf.
 */
function publish(obj) {
  if (role === 'satellite') sendText(hubSocket, JSON.stringify(obj), true);
  else broadcast(obj);
}

/** Forward a command to the v8 object: cmd <jsonString>. */
function toLive(obj) {
  Max.outlet('cmd', JSON.stringify(obj));
}

/** Tracks in Live's own order, so the app's picker doesn't shuffle. */
function trackRoster() {
  // Two devices can sit on one track; the app wants the track listed once.
  const byIndex = new Map();
  for (const track of trackByDevice.values()) {
    if (track) byIndex.set(track.index, track);
  }
  const tracks = Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
  return { type: 'tracks', tracks: tracks };
}

/** Record where a device now sits, and tell the app if anything moved. */
function setDeviceTrack(device, track) {
  if (!track || typeof track.index !== 'number') return;
  const known = trackByDevice.get(device);
  if (known && known.index === track.index && known.name === track.name) return;
  trackByDevice.set(device, track);
  if (role === 'hub') broadcast(trackRoster());
}

function forgetDevice(device) {
  if (!trackByDevice.delete(device)) return;
  if (role === 'hub') broadcast(trackRoster());
}

// ── Role: hub (we own the port) ───────────────────────────────────────────

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

server.on('listening', () => {
  role = 'hub';
  if (myTrack) trackByDevice.set(SELF, myTrack);
  Max.post(
    `ChordLens hub listening on ws://127.0.0.1:${PORT}` +
      (myTrack ? ` (track ${myTrack.index}: ${myTrack.name})` : ''),
  );
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another ChordLens device got here first — join it instead of dying.
    becomeSatellite();
    return;
  }
  Max.post(`ChordLens WebSocket error: ${err.message}`, Max.POST_LEVELS.ERROR);
});

function tryListen() {
  try {
    server.listen(PORT, '127.0.0.1');
  } catch (e) {
    scheduleReelection();
  }
}

function onConnect(socket) {
  socket.isAlive = true;
  socket.isSatellite = false;
  clients.add(socket);

  // Greet + replay cached state, then ask v8 for a fresh snapshot.
  sendText(socket, JSON.stringify({ type: 'hello', port: PORT, role: role }), false);
  sendText(socket, JSON.stringify(trackRoster()), false);
  if (lastSession) sendText(socket, JSON.stringify({ type: 'session', session: lastSession }), false);
  if (lastTransport) sendText(socket, JSON.stringify(lastTransport), false);
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
  /**
   * Clean up once, however the connection ends. An upgraded HTTP socket is left
   * half-open when the peer disappears: `end` fires but `close` never does,
   * because nothing closes our side. So listen for all three and destroy the
   * socket ourselves.
   */
  const gone = () => {
    clients.delete(socket);
    forgetDevice(socket);
    socket.destroy();
  };
  socket.on('close', gone);
  socket.on('end', gone);
  socket.on('error', gone);
}

function handleFrame(socket, frame) {
  const { opcode, payload } = frame;
  socket.isAlive = true;
  if (opcode === 0x8) {
    // close
    try {
      socket.end(encodeFrame(Buffer.alloc(0), 0x8, false));
    } catch (e) {
      /* already gone */
    }
    clients.delete(socket);
    return;
  }
  if (opcode === 0x9) {
    // ping → pong
    try {
      socket.write(encodeFrame(payload, 0xa, false));
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
    sendText(socket, JSON.stringify({ type: 'error', message: 'bad json' }), false);
    return;
  }
  if (msg.type === 'ping') {
    sendText(socket, JSON.stringify({ type: 'pong' }), false);
    return;
  }

  // A satellite device announcing itself, then feeding us its track's notes.
  if (msg.type === 'device') {
    socket.isSatellite = true;
    setDeviceTrack(socket, msg.track);
    return;
  }
  if (msg.type === 'note') {
    broadcast(msg); // relay another track's playing to the app
    return;
  }

  toLive(msg);
}

// ── Role: satellite (another device owns the port) ────────────────────────

function becomeSatellite() {
  role = 'satellite';
  Max.post(
    'ChordLens: port ' +
      PORT +
      ' already held by another ChordLens device — joining it as a satellite' +
      (myTrack ? ` (track ${myTrack.index}: ${myTrack.name})` : ''),
  );
  connectToHub();
}

function connectToHub() {
  const key = crypto.randomBytes(16).toString('base64');
  const socket = net.connect(PORT, '127.0.0.1');
  hubSocket = socket;

  socket.on('connect', () => {
    socket.write(
      'GET / HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${PORT}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n\r\n',
    );
  });

  let handshakeDone = false;
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshakeDone) {
      const end = buf.indexOf('\r\n\r\n');
      if (end === -1) return;
      const head = buf.slice(0, end).toString('utf8');
      buf = buf.slice(end + 4);
      if (!/^HTTP\/1\.1 101/.test(head)) {
        socket.destroy();
        return;
      }
      handshakeDone = true;
      // Announce our track so the hub can label the notes we send it.
      if (myTrack) sendText(socket, JSON.stringify({ type: 'device', track: myTrack }), true);
    }
    // The hub's broadcasts aren't for us; drain frames and drop them, but do
    // answer pings so it doesn't cull us as a dead client.
    for (;;) {
      const frame = decodeFrame(buf);
      if (!frame) break;
      buf = frame.rest;
      if (frame.opcode === 0x9) {
        try {
          socket.write(encodeFrame(frame.payload, 0xa, true));
        } catch (e) {
          /* closing */
        }
      }
    }
  });

  const lost = () => {
    if (hubSocket !== socket) return;
    hubSocket = null;
    scheduleReelection();
  };
  socket.on('close', lost);
  socket.on('error', lost);
}

/**
 * The hub went away (or never answered). Try to take the port ourselves; if
 * someone else beat us to it, the EADDRINUSE handler puts us back here.
 */
function scheduleReelection() {
  if (reelectTimer) return;
  reelectTimer = setTimeout(() => {
    reelectTimer = null;
    role = 'starting';
    tryListen();
  }, REELECT_MS);
}

// ── Keep-alive (hub only) ─────────────────────────────────────────────────

const keepAlive = setInterval(() => {
  for (const s of clients) {
    if (s.isAlive === false) {
      // A satellite that stopped answering takes its track out of the roster.
      clients.delete(s);
      forgetDevice(s);
      try {
        s.destroy();
      } catch (e) {
        /* ignore */
      }
      continue;
    }
    s.isAlive = false;
    try {
      s.write(encodeFrame(Buffer.alloc(0), 0x9, false)); // protocol ping
    } catch (e) {
      clients.delete(s);
    }
  }
}, 10000);
server.on('close', () => clearInterval(keepAlive));

// ── Inbound from the Max patch ────────────────────────────────────────────

// MIDI note from [midiin]→[midiparse]→[prepend note]:  note <pitch> <velocity>
Max.addHandler('note', (pitch, velocity) => {
  publish({
    type: 'note',
    pitch: Number(pitch),
    velocity: Number(velocity),
    track: myTrack ? myTrack.index : null,
  });
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

  // Our own track identity — stamp it on our notes, and make sure it reaches
  // the hub's roster (which is the only track list the app is told about).
  if (obj.type === 'device') {
    myTrack = obj.track;
    setDeviceTrack(SELF, myTrack);
    if (role === 'satellite') sendText(hubSocket, JSON.stringify(obj), true);
    return;
  }

  // Song-wide state (transport, tempo, key, session) is the same for every
  // device in the set. Only the hub reports it, or the app gets duplicates.
  if (role === 'satellite') return;
  if (obj.type === 'session' && obj.session) lastSession = obj.session;
  if (obj.type === 'transport') lastTransport = obj;
  broadcast(obj);
});

/**
 * Ask the v8 object which track we're on, until it tells us.
 *
 * Track identity can't wait on `live.thisdevice`: it bangs once when the device
 * is instantiated, so a script reloaded in place never sees one, and a
 * satellite — which no app client ever connects to — would otherwise have
 * nothing to prompt it. Load order between the two scripts isn't guaranteed
 * either, hence retrying rather than asking once.
 */
const identify = setInterval(() => {
  if (myTrack) {
    clearInterval(identify);
    return;
  }
  toLive({ type: 'get_device' });
}, 1500);
toLive({ type: 'get_device' });

// Never let a stray error take the server (and the bridge) down.
process.on('uncaughtException', (err) => {
  Max.post(`ChordLens uncaught: ${err.message}`, Max.POST_LEVELS.ERROR);
});
process.on('unhandledRejection', (reason) => {
  Max.post(`ChordLens unhandled rejection: ${reason}`, Max.POST_LEVELS.ERROR);
});

Max.post('ChordLens node bridge loaded (dependency-free).');
tryListen();
