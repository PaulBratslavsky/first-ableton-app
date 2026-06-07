# ChordLens — Max for Live bridge

A Max for Live **MIDI Effect** device that connects Ableton Live to the ChordLens
Tauri app over a local WebSocket. It does two things:

1. **Forwards the track's MIDI** (clips *and* live input) straight to the app —
   no IAC bus required.
2. **Bridges the Live API** so the app can read transport/session state (pushed
   live, no polling) and send control commands (set tempo, fire clips, create
   tracks, …).

```
                       ┌──────────────────── ChordLens.amxd ────────────────────┐
 MIDI from Live ─▶ midiin ─┬─▶ midiout ─▶ (instrument, e.g. Spire)               │
                           └─▶ midiparse ─▶ prepend note ─▶ node.script ⇄ WebSocket :17999 ⇄ Tauri app
                                                                  ⇕  (cmd / fromlive)
 Ableton ◀──────── Live API ──▶ v8 (chordlens.v8.js) ─────────────┘
```

`midiin` carries the track's MIDI stream from Live — **clip playback included**.
(`notein` would only hear physical MIDI *ports*, so it misses clips — that's why
the tap is `midiin → midiparse`.) The `midiin → midiout` branch is a transparent
passthrough so the device doesn't block MIDI to the instrument after it.

Why the two-script split? **Only the `v8` object can touch the Live API**
(node.script can't), and **only node.script can host a WebSocket** (the Max `js`
objects can't). They talk to each other over Max messages inside the patch.

## Files

| File | Runs in | Role |
|------|---------|------|
| `ChordLens.maxpat` | Max | Patch wiring (open it, save as `ChordLens.amxd`) |
| `chordlens.v8.js` | Max `v8` object | Live API: observe state + run commands |
| `chordlens.server.js` | `node.script` | WebSocket server + Max⇄Node bridge |
| `package.json` | node.script | declares the `ws` dependency |

## Install

### 1. Install the Node dependency
The WebSocket server needs `ws`. From this folder:

```bash
cd max-for-live
npm install
```

(You can also trigger it from inside Max by sending the `node.script` object the
message `script npm install`, but the command line is simpler.)

### 2. Build the `.amxd` device
Max for Live devices are binary `.amxd` files, so you assemble it once in Max.
The whole patch (passthrough + note tap + Live API bridge) is self-contained, so
you paste it in one shot:

1. Copy the patch to your clipboard:
   ```bash
   cat max-for-live/ChordLens.maxpat | pbcopy   # macOS
   ```
2. In Ableton, drag a **Max MIDI Effect** onto a MIDI track
   (Browser → **Max for Live → Max MIDI Effect**).
3. Click the device's **edit (✏️) button** — the Max editor opens showing the
   default `midiin → midiout`.
4. In the editor: **⌘A** (Select All) → **Delete** → **⌘V** (Paste). The
   ChordLens objects appear (`midiin`, `midiout`, `midiparse`, `prepend note`,
   `node.script`, `v8`, `live.thisdevice`, with cords).
5. **⌘S** → save as **`ChordLens.amxd`** in this `max-for-live/` folder so it
   sits next to the `.js` files and `node_modules/`.
6. Close the editor.

> **Why paste the whole patch?** It includes its own `midiin → midiout`
> passthrough, so replacing the template's contents wholesale gives you exactly
> one of each object and keeps MIDI flowing to the instrument after the device.
>
> **If ⌘V pastes nothing** (some Max builds won't paste raw JSON), instead use
> **File → Open** on `ChordLens.maxpat` in the editor, **⌘A → ⌘C** there, switch
> back to the device, and **⌘V**.
>
> The `.js` files must live next to the `.amxd`. If you save the device
> elsewhere, copy `chordlens.v8.js`, `chordlens.server.js`, `package.json`, and
> `node_modules/` alongside it.

### 3. Verify
- Open the **Max Console** (Window → Max Console, or the list icon on the
  editor's right edge) and look for:
  `ChordLens WebSocket listening on ws://127.0.0.1:17999`.
- Confirm the OS sees it listening:
  ```bash
  lsof -nP -iTCP:17999 -sTCP:LISTEN
  ```
- In ChordLens, the **Ableton** chip turns green and shows live BPM. Hit **Play**
  in Ableton — clip notes light up the views.

> Ignore any `crash recovery: patcher no longer exists …` lines in the console —
> that's unrelated Max housekeeping about its own demo patches.

## Use it from the app

```ts
import { useAbleton } from '#/hooks/useAbleton'

function Panel() {
  const live = useAbleton() // ws://127.0.0.1:17999 by default
  // live.connected, live.tempo, live.isPlaying, live.session
  // live.pitches  ← notes played into the device (replaces the IAC bus)
  // live.setTempo(128), live.fireClip(0, 0), live.createMidiTrack(), …
}
```

The hook auto-reconnects, so load order (app first or Ableton first) doesn't
matter.

## WebSocket protocol

Plain JSON, one object per message, on `ws://127.0.0.1:17999`.
Override the port with the `CHORDLENS_WS_PORT` env var on the node side and the
`url` arg to `useAbleton`.

### Device → app (events)
| Message | Meaning |
|---------|---------|
| `{ "type": "hello", "port": 17999 }` | sent on connect |
| `{ "type": "note", "pitch": 60, "velocity": 100 }` | MIDI note; `velocity: 0` = note-off |
| `{ "type": "transport", "isPlaying": true }` | transport changed |
| `{ "type": "tempo", "tempo": 128.0 }` | tempo changed |
| `{ "type": "session", "session": { … } }` | full snapshot (on connect / on request) |
| `{ "type": "error", "message": "…" }` | something went wrong |

`session` shape: `{ tempo, isPlaying, signatureNumerator, signatureDenominator,
trackCount, returnTrackCount }`.

### App → device (commands)
Add an optional numeric `id` to any command to get a reply
(`{ id, ok, result }` on success, `{ id, error }` on failure). Without an `id`
it's fire-and-forget.

| Command | Params |
|---------|--------|
| `get_session` | – |
| `set_tempo` | `{ tempo }` |
| `start_playback` / `stop_playback` | – |
| `create_midi_track` | `{ index }` (-1 = end) |
| `set_track_name` | `{ track, name }` |
| `fire_clip` | `{ track, clip }` |
| `stop_clip` | `{ track }` (stops all clips on the track) |
| `get_track_info` | `{ track }` |

## Extending it

To add a capability, edit **`chordlens.v8.js`**: add a `case` in `dispatch()`
using the [Live Object Model](https://docs.cycling74.com/max8/vignettes/live_object_model)
(e.g. `api('live_set tracks 0 mixer_device volume').set('value', 0.85)` — use the
`api()` helper, see the gotcha below), and to push a new live value, add a
`LiveAPI` observer in `ensureObservers()`. No app or patch changes are needed for
new fire-and-forget commands — just call `bridge.send('your_command', { … })`.
Max hot-reloads the `.js` files when `@watch 1` is set (it is), so you don't need
to rebuild the device — only patch *wiring* changes require re-editing the
`.amxd`.

## Notes & gotchas

- **`LiveAPI` must use the two-arg form** `new LiveAPI(callback, path)`. In the
  `v8` object a single string arg is read as the *callback*, leaving the path
  unset — which shows up as `get: no valid object set` in the console. The
  `api()` helper in `chordlens.v8.js` wraps this (`new LiveAPI(noop, path)`);
  use it for all one-shot reads/writes.
- **Capturing notes uses `midiin`, not `notein`.** `notein` only hears physical
  MIDI ports, so it misses clip playback. `midiin` carries Live's track MIDI.
- The server binds **127.0.0.1** only (local-only). Change the host in
  `chordlens.server.js` if you really need LAN access — there's no auth.
- This device coexists with the AbletonMCP remote script (port 9877) — different
  ports, different mechanisms, no conflict.
- Track/clip indices are **0-based** and match Live's own ordering.
