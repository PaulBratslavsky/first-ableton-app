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
var trackObserver = null; // re-made whenever this device's track changes
var lastTrack = null;

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
  pushTrack();
  pushSession();
}

// ── Which track am I on? ──────────────────────────────────────────────────
//
// Several copies of this device can be in one set, one per track. Each needs to
// say which track its notes came from, so the app can tell them apart instead
// of merging every track into one chord.

/**
 * Walk up from this device to the track that owns it. A device sitting on a
 * track is one hop (`live_set tracks 3 devices 0` → `live_set tracks 3`); one
 * inside a rack is several, via the chain.
 */
function trackIdentity() {
  var node = api('this_device');
  for (var hops = 0; hops < 8; hops++) {
    var path = String(node.path).replace(/^"|"$/g, '');
    var match = path.match(/^live_set tracks (\d+)$/);
    if (match) {
      return { index: Number(match[1]), name: str(node, 'name'), color: num(node, 'color') };
    }
    if (!path) return null;
    node = api(path + ' canonical_parent');
  }
  return null;
}

/**
 * Tell node.script which track this device is on, and keep watching that
 * track's name so a rename shows up in the app.
 */
function pushTrack(force) {
  var track;
  try {
    track = trackIdentity();
  } catch (e) {
    emit({ type: 'error', message: 'track identity unavailable: ' + e });
    return;
  }
  if (!track) return;

  var changed =
    !lastTrack || lastTrack.index !== track.index || lastTrack.name !== track.name;
  lastTrack = track;
  if (changed || force) emit({ type: 'device', track: track });

  // Re-point the name observer whenever the track index moves under us.
  try {
    trackObserver = new LiveAPI(onTrackName, 'live_set tracks ' + track.index);
    trackObserver.property = 'name';
  } catch (e) {
    trackObserver = null;
  }
}

function onTrackName(args) {
  if (!args || args[0] !== 'name' || !lastTrack) return;
  var name = args.length > 1 ? String(args[1]) : lastTrack.name;
  if (name === lastTrack.name) return;
  lastTrack = { index: lastTrack.index, name: name, color: lastTrack.color };
  emit({ type: 'device', track: lastTrack });
}

/** Reordering or deleting tracks changes our index — re-resolve it. */
function onTracks() {
  pushTrack();
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

  // Each observer is isolated: a failure on one (e.g. an older Live without
  // an observable `scale_name`) must NOT take down transport/tempo. Critical
  // transport + tempo first; song-key observers are best-effort.
  addObserver(onTransport, 'is_playing');
  addObserver(onTempo, 'tempo');
  addObserver(onKey, 'root_note');
  addObserver(onKey, 'scale_name');
  addObserver(onTracks, 'tracks');
}

function addObserver(callback, prop) {
  try {
    var obs = new LiveAPI(callback, 'live_set');
    obs.property = prop;
    observers.push(obs);
  } catch (e) {
    emit({ type: 'error', message: 'observer ' + prop + ' unavailable: ' + e });
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

      /**
       * Which track am I on? node.script asks for this on startup rather than
       * waiting for `live.thisdevice`, which bangs only at instantiation — a
       * script reloaded in place (autowatch, @watch) never sees one.
       */
      case 'get_device':
        pushTrack(true);
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
  try {
    var v = api.get(prop);
    return v && v.length ? v[0] : null;
  } catch (e) {
    return null; // property not available in this Live version — don't poison the caller
  }
}

function str(api, prop) {
  try {
    var v = api.get(prop);
    if (Array.isArray(v)) return v.length ? String(v[0]) : '';
    return v == null ? '' : String(v);
  } catch (e) {
    return '';
  }
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
