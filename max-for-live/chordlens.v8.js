/**
 * ChordLens — Live API bridge (runs inside the Max `v8` object).
 *
 * This is the ONLY layer with access to Ableton's Live API (LiveAPI is not
 * available in node.script). Its two jobs:
 *
 *   1. OBSERVE Live state (transport, tempo) and push changes out to
 *      node.script, which broadcasts them over the WebSocket.
 *   2. RUN commands that arrive from the app (set tempo, fire clip, create
 *      track, …) against the Live API.
 *
 * Wiring in the patch:
 *   node.script  outlet 0 → v8 inlet 0   (commands:  "cmd <jsonString>")
 *   v8           outlet 0 → node.script inlet 0  (events: "fromlive <jsonString>")
 *   live.thisdevice outlet → v8 inlet 0   (a bang once the device is loaded → init)
 *
 * Message contract with node.script
 *   IN  (from node):  cmd <json>      json = { id?, type, ...params }
 *   OUT (to node):    fromlive <json> json = { type, ... } | { id, ok, result } | { id, error }
 *
 * All payloads are a single JSON string atom so spaces survive the Max message.
 */

autowatch = 1;
inlets = 1;
outlets = 1;

var observersReady = false;
var observers = []; // keep references so they aren't garbage-collected

/**
 * One-shot LiveAPI accessor. The two-arg form (callback, path) is required:
 * in the `v8` object a single string arg is taken as the callback, leaving the
 * path unset — which surfaces as "get: no valid object set". `noop` is a no-op
 * observer callback for these read/write-once uses.
 */
function noop() {}
function api(path) {
  return new LiveAPI(noop, path);
}

/** Send a JSON-able object back to node.script (→ WebSocket broadcast). */
function emit(obj) {
  outlet(0, 'fromlive', JSON.stringify(obj));
}

/** Reply to a specific command by echoing its id. */
function reply(id, payload) {
  if (id === undefined || id === null) {
    emit(payload);
  } else {
    emit({ id: id, ok: true, result: payload });
  }
}

function replyError(id, message) {
  if (id === undefined || id === null) emit({ type: 'error', message: String(message) });
  else emit({ id: id, error: String(message) });
}

// ── Entry points from the patch ───────────────────────────────────────────

/** live.thisdevice sends a bang once the device is fully instantiated. */
function bang() {
  ensureObservers();
  pushSession();
}

/** Commands from node.script arrive as: cmd <jsonString> */
function cmd(jsonStr) {
  ensureObservers();
  var msg;
  try {
    msg = JSON.parse(jsonStr);
  } catch (e) {
    replyError(null, 'bad command json: ' + e);
    return;
  }
  dispatch(msg);
}

// ── Observers: push Live state changes without polling ────────────────────

function ensureObservers() {
  if (observersReady) return;
  observersReady = true;
  try {
    var playing = new LiveAPI(onTransport, 'live_set');
    playing.property = 'is_playing';
    observers.push(playing);

    var tempo = new LiveAPI(onTempo, 'live_set');
    tempo.property = 'tempo';
    observers.push(tempo);

    // Song key: root_note (0-11) + scale_name. Either changing re-emits both.
    var rootObs = new LiveAPI(onKey, 'live_set');
    rootObs.property = 'root_note';
    observers.push(rootObs);

    var scaleObs = new LiveAPI(onKey, 'live_set');
    scaleObs.property = 'scale_name';
    observers.push(scaleObs);
  } catch (e) {
    observersReady = false; // let the next command retry
    replyError(null, 'observer init failed: ' + e);
  }
}

function onTransport(args) {
  // args = ["is_playing", value]
  if (!args || args[0] !== 'is_playing') return;
  emit({ type: 'transport', isPlaying: args[1] === 1 });
}

function onTempo(args) {
  if (!args || args[0] !== 'tempo') return;
  emit({ type: 'tempo', tempo: args[1] });
}

function onKey() {
  emit(keyInfo());
}

function keyInfo() {
  var ls = api('live_set');
  return { type: 'key', rootPc: num(ls, 'root_note'), scaleName: str(ls, 'scale_name') };
}

// ── Command dispatch ──────────────────────────────────────────────────────

function dispatch(msg) {
  var id = msg.id;
  var liveSet = api('live_set');
  try {
    switch (msg.type) {
      case 'get_session':
        reply(id, sessionInfo());
        break;

      case 'set_tempo':
        liveSet.set('tempo', Number(msg.tempo));
        reply(id, { tempo: Number(msg.tempo) });
        break;

      case 'start_playback':
        liveSet.call('start_playing');
        reply(id, { isPlaying: true });
        break;

      case 'stop_playback':
        liveSet.call('stop_playing');
        reply(id, { isPlaying: false });
        break;

      case 'create_midi_track': {
        var index = msg.index === undefined ? -1 : Number(msg.index);
        liveSet.call('create_midi_track', index);
        reply(id, { trackCount: liveSet.getcount('tracks') });
        break;
      }

      case 'set_track_name': {
        var t = api('live_set tracks ' + Number(msg.track));
        t.set('name', String(msg.name));
        reply(id, { track: Number(msg.track), name: String(msg.name) });
        break;
      }

      case 'fire_clip': {
        var slot = api(
          'live_set tracks ' + Number(msg.track) + ' clip_slots ' + Number(msg.clip),
        );
        slot.call('fire');
        reply(id, { track: Number(msg.track), clip: Number(msg.clip) });
        break;
      }

      case 'stop_clip': {
        var stopTrack = api('live_set tracks ' + Number(msg.track));
        stopTrack.call('stop_all_clips');
        reply(id, { track: Number(msg.track) });
        break;
      }

      case 'get_track_info':
        reply(id, trackInfo(Number(msg.track)));
        break;

      default:
        replyError(id, 'unknown command: ' + msg.type);
    }
  } catch (e) {
    replyError(id, e);
  }
}

// ── Read helpers ──────────────────────────────────────────────────────────

function num(api, prop) {
  var v = api.get(prop);
  return v && v.length ? v[0] : null;
}

function str(api, prop) {
  var v = api.get(prop);
  if (Array.isArray(v)) return v.length ? String(v[0]) : '';
  return v == null ? '' : String(v);
}

function sessionInfo() {
  var liveSet = api('live_set');
  return {
    tempo: num(liveSet, 'tempo'),
    isPlaying: num(liveSet, 'is_playing') === 1,
    signatureNumerator: num(liveSet, 'signature_numerator'),
    signatureDenominator: num(liveSet, 'signature_denominator'),
    trackCount: liveSet.getcount('tracks'),
    returnTrackCount: liveSet.getcount('return_tracks'),
    rootPc: num(liveSet, 'root_note'),
    scaleName: str(liveSet, 'scale_name'),
  };
}

function pushSession() {
  emit({ type: 'session', session: sessionInfo() });
}

function trackInfo(trackIndex) {
  var track = api('live_set tracks ' + trackIndex);
  var clipSlots = track.getcount('clip_slots');
  var clips = [];
  for (var i = 0; i < clipSlots; i++) {
    var slot = api('live_set tracks ' + trackIndex + ' clip_slots ' + i);
    var hasClip = num(slot, 'has_clip') === 1;
    clips.push({ index: i, hasClip: hasClip });
  }
  return {
    index: trackIndex,
    name: String(track.get('name')),
    clipSlotCount: clipSlots,
    clips: clips,
  };
}
