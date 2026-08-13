# ChordLens — Max for Live bridge

A Max for Live **MIDI Effect** device that connects Ableton Live to the ChordLens
app over a local WebSocket. It does two things:

1. **Forwards the track's MIDI** (clips *and* live input) to the app — no IAC bus.
2. **Bridges the Live API** so the app gets transport/tempo, the **song key**, and
   can send control commands (set tempo, fire clips, create tracks, …).

It is **dependency-free** — the WebSocket server is implemented with Node's
built-ins, so there's **no `npm install`, no `ws`, no `node_modules`**. That was
the single thing that made earlier versions fragile; it's gone.

```
                       ┌──────────────────── ChordLens.amxd ────────────────────┐
 MIDI from Live ─▶ midiin ─┬─▶ midiout ─▶ (instrument, e.g. Spire)               │
                           └─▶ midiparse ─▶ prepend note ─▶ node.script ⇄ WebSocket :17999 ⇄ app
                                                                  ⇕  (cmd / fromlive)
 Ableton ◀──────── Live API ──▶ v8 (chordlens.v8.js) ─────────────┘
```

`midiin` carries the track's MIDI from Live — **clip playback included**.
(`notein` would only hear physical MIDI *ports* and miss clips.) The
`midiin → midiout` branch is a transparent passthrough so the instrument after
the device still sounds.

Why the two-script split: **only the `v8` object can touch the Live API**, and
**only `node.script` can host a WebSocket**. They talk over Max messages.

## Files

| File | Runs in | Role |
|------|---------|------|
| `ChordLens.maxpat` | Max | Patch wiring (paste → save as `ChordLens.amxd`) |
| `chordlens.v8.js` | Max `v8` object | Live API: observe transport/tempo/**key** + run commands |
| `chordlens.server.js` | `node.script` | **Dependency-free** WebSocket server + Max⇄Node bridge |
| `package.json` | — | metadata only (no dependencies) |

There is **no `node_modules`** — nothing to install, nothing to "not find."

## Build the `.amxd` device

Max for Live devices are binary `.amxd` files, so you assemble it once. The whole
patch is self-contained, so paste it in one shot:

1. Copy the patch to your clipboard:
   ```bash
   cat max-for-live/ChordLens.maxpat | pbcopy   # macOS
   ```
2. In Ableton, drag a **Max MIDI Effect** onto a MIDI track
   (Browser → **Max for Live → Max MIDI Effect**).
3. Click the device's **edit (✏️) button** — the Max editor opens with the
   default `midiin → midiout`.
4. In the editor: **⌘A** (Select All) → **Delete** → **⌘V** (Paste). The ChordLens
   objects appear (`midiin`, `midiout`, `midiparse`, `prepend note`,
   `node.script`, `v8`, `live.thisdevice`).
5. **⌘S** → save as **`ChordLens.amxd`** in this `max-for-live/` folder (next to
   the two `.js` files).
6. Close the editor.

> **If ⌘V pastes nothing** (some Max builds won't paste raw JSON): in the editor
> use **File → Open** on `ChordLens.maxpat`, **⌘A → ⌘C** there, switch back to the
> device, and **⌘V**.

### Verify
- Open **Window → Max Console** and look for:
  `ChordLens WebSocket listening on ws://127.0.0.1:17999` (no "can't find file").
- Or from a shell: `lsof -nP -iTCP:17999 -sTCP:LISTEN`.
- In ChordLens, the **Ableton** chip turns green (click **↻** if needed) and shows
  live BPM; play a clip and the views light up.

> Ignore any `crash recovery: patcher no longer exists …` lines — that's unrelated
> Max housekeeping about its own demo patches.

## After you edit a script: `./install-device.sh`

The `.amxd` loads `chordlens.server.js` / `chordlens.v8.js` by bare filename,
resolved next to the device itself. The moment you drag the device into Live,
Ableton copies it into your **User Library** — and from then on Live reads *those*
copies, not the ones in this repo. Editing here changes nothing in Live, silently.

```bash
./install-device.sh          # copy the scripts to every install found
./install-device.sh --check  # report drift, change nothing (exit 1 if stale)
```

The device watches its scripts (`@watch 1` on `node.script`, `autowatch = 1` in
`v8`), so it reloads on its own — the Max console should print
`ChordLens hub listening on ws://127.0.0.1:17999 (track N: Name)`.

Set `ABLETON_USER_LIBRARY` if yours isn't at `~/Music/Ableton/User Library`.

If the console still shows the old `ChordLens WebSocket listening …` line, the
scripts didn't reload — remove and re-add the device, or reopen the set.

## Freeze it (recommended for a portable device)

Freezing bundles the two `.js` files **into** the `.amxd`, so it works from any
location and Ableton's habit of copying devices can't separate it from its
scripts. Because it's dependency-free, freezing is trivial — there's no
`node_modules` to bundle.

Freeze for distribution, not while developing: a frozen device ignores the
scripts on disk entirely, so `install-device.sh` can't reach it and edits need an
unfreeze/re-freeze round trip.

1. In the Max editor, click the **❄️ snowflake "Freeze Device"** button in the
   toolbar.
2. **⌘S** to save (the device is frozen *on save*).

After that the bundled files are used even if similarly-named files exist on disk
— the duplicate-copy problem is gone.

## Use it from the app

```ts
import { useAbleton } from '#/hooks/useAbleton'

const live = useAbleton() // ws://127.0.0.1:17999 by default
// live.connected, live.status, live.tempo, live.isPlaying
// live.liveKey       ← Ableton's song key { rootPc, scaleName }
// live.pitches       ← notes from the device (no IAC bus)
// live.setTempo(128), live.fireClip(0, 0), live.startPlayback(), live.reconnect()
```

The client auto-reconnects (with a heartbeat/watchdog), so launch order doesn't
matter; the chip's **↻** button forces an immediate reconnect.

## One device per track

Put the device on as many tracks as you like. Each copy runs its own bridge, and
they all want the same port, so they elect roles:

- the first to bind port 17999 is the **hub** — it serves the app and relays for
  the others;
- the rest become **satellites**, connecting to the hub as clients and forwarding
  their own track's notes through it.

So the app keeps one connection but sees every track, with each note stamped with
the track that played it (the header grows a track picker once a second device
appears). Remove the hub's device and the port frees up; whichever satellite
notices first — within a couple of seconds — takes over.

Song-wide state (transport, tempo, key, session) is reported by the hub alone, so
it doesn't arrive once per device.

Run `npm test` in this folder to exercise the election, relaying and failover
with two real bridges (`max-api` stubbed, since it only exists inside Ableton).

## WebSocket protocol

Plain JSON, one object per message, on `ws://127.0.0.1:17999`. Override the port
with `CHORDLENS_WS_PORT` (node side) and the `url` arg to `useAbleton`.

### Device → app (events)
| Message | Meaning |
|---------|---------|
| `{ "type": "hello", "port": 17999, "role": "hub" }` | sent on connect |
| `{ "type": "note", "pitch": 60, "velocity": 100, "track": 0 }` | MIDI note; `velocity: 0` = note-off. `track` is the Live track index, or `null` before the device has resolved one |
| `{ "type": "tracks", "tracks": [{ "index": 0, "name": "Keys" }] }` | every track currently feeding the hub; re-sent when one joins, leaves or is renamed |
| `{ "type": "transport", "isPlaying": true }` | transport changed |
| `{ "type": "tempo", "tempo": 128.0 }` | tempo changed |
| `{ "type": "key", "rootPc": 0, "scaleName": "Major" }` | song key changed |
| `{ "type": "session", "session": { … } }` | full snapshot (on connect / on request) |
| `{ "type": "pong" }` | heartbeat ack |
| `{ "type": "error", "message": "…" }` | something went wrong |

`session` shape: `{ tempo, isPlaying, signatureNumerator, signatureDenominator,
trackCount, returnTrackCount, rootPc, scaleName }`.

### App → device (commands)
Add an optional numeric `id` for a reply (`{ id, ok, result }` / `{ id, error }`);
without it, fire-and-forget. `{ "type": "ping" }` → `{ "type": "pong" }`.

| Command | Params |
|---------|--------|
| `get_session` | – |
| `set_tempo` | `{ tempo }` |
| `start_playback` / `stop_playback` | – |
| `create_midi_track` | `{ index }` (-1 = end) |
| `set_track_name` | `{ track, name }` |
| `fire_clip` | `{ track, clip }` |
| `stop_clip` | `{ track }` |
| `get_track_info` | `{ track }` |

## Extending it

Edit **`chordlens.v8.js`**: add a `case` in `dispatch()` using the
[Live Object Model](https://docs.cycling74.com/max8/vignettes/live_api) via the
`api()` helper (e.g. `api('live_set tracks 0 mixer_device volume').set('value', 0.85)`),
and add a `LiveAPI` observer in `ensureObservers()` to push a new live value.
`@watch 1` hot-reloads the `.js` files, so only patch *wiring* changes require
re-editing the `.amxd`.

## Notes & gotchas

- **`LiveAPI` must use the two-arg form** `new LiveAPI(callback, path)`; a lone
  string is read as the callback (→ `get: no valid object set`). The `api()`
  helper wraps this.
- **Capture notes from `midiin`, not `notein`** — `notein` misses clip playback.
- **Dependency-free** — the server uses Node built-ins (`http` + `crypto`); no
  `ws`, no `node_modules`, no `npm install`.
- Binds **127.0.0.1** only (local). No auth.
- Coexists with the AbletonMCP remote script (port 9877) — different ports, no
  conflict.
- Track/clip indices are **0-based**.
