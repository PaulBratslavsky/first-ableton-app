/**
 * ChordLens — WebSocket bridge (runs inside the Max `node.script` object).
 *
 * node.script runs a real Node.js process, so it can host a WebSocket server
 * that the ChordLens Tauri frontend connects to directly. It does NOT have
 * Live API access — anything touching Ableton is delegated to the `v8` object
 * (chordlens.v8.js) over Max messages.
 *
 * Data flow
 *   MIDI:     [notein]→[pack]→[prepend note]→ node  →(broadcast)→ app
 *   Live→app: v8 →"fromlive <json>"→ node →(broadcast)→ app
 *   app→Live: app →(ws)→ node →"cmd <json>"→ v8
 *
 * WebSocket protocol (JSON, one object per message) — see README.md.
 *   Device → app:  {type:"note",pitch,velocity} | {type:"transport",isPlaying}
 *                  {type:"tempo",tempo} | {type:"session",session} | {type:"hello"}
 *                  plus command replies: {id,ok,result} | {id,error}
 *   App → device:  {id?,type,...params}  e.g. {type:"set_tempo",tempo:128}
 *
 * Install deps once (in this folder):  npm install
 */

const Max = require('max-api');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.CHORDLENS_WS_PORT) || 17999;

const clients = new Set();

// Cache the last-known transport/session so a freshly connected client gets
// state immediately instead of waiting for the next change.
let lastSession = null;
let lastTransport = null;

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

wss.on('listening', () => {
  Max.post(`ChordLens WebSocket listening on ws://127.0.0.1:${PORT}`);
});

wss.on('error', (err) => {
  Max.post(`ChordLens WebSocket error: ${err.message}`, Max.POST_LEVELS.ERROR);
});

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;
  Max.post(`ChordLens client connected (${clients.size} total)`);

  // Greet + replay cached state.
  send(ws, { type: 'hello', port: PORT });
  if (lastSession) send(ws, { type: 'session', session: lastSession });
  if (lastTransport) send(ws, lastTransport);
  // Ask v8 for a fresh session snapshot for this client.
  toLive({ type: 'get_session' });

  // Protocol-level pong (from ws.ping below) marks the client alive.
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    ws.isAlive = true;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      send(ws, { type: 'error', message: `bad json: ${e.message}` });
      return;
    }
    // App-level heartbeat: answer pings, don't forward them to Live.
    if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
      return;
    }
    toLive(msg);
  });

  ws.on('close', () => {
    clients.delete(ws);
    Max.post(`ChordLens client disconnected (${clients.size} total)`);
  });

  ws.on('error', () => clients.delete(ws));
});

// Drop clients that stop responding to pings (half-open sockets).
const keepAlive = setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      clients.delete(ws);
    }
  }
}, 10000);
wss.on('close', () => clearInterval(keepAlive));

// Never let a stray error take the WebSocket server (and the bridge) down.
process.on('uncaughtException', (err) => {
  Max.post(`ChordLens uncaught: ${err.message}`, Max.POST_LEVELS.ERROR);
});
process.on('unhandledRejection', (reason) => {
  Max.post(`ChordLens unhandled rejection: ${reason}`, Max.POST_LEVELS.ERROR);
});

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

/** Forward a command to the v8 object: cmd <jsonString>. */
function toLive(obj) {
  Max.outlet('cmd', JSON.stringify(obj));
}

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

Max.post('ChordLens node bridge loaded.');
