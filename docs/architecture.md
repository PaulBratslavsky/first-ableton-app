# ChordLens — Architecture

ChordLens is a desktop app that watches what you play on a MIDI instrument and
renders it live across four views (piano, guitar, bass, notation) with chord and
key detection. It also talks **to** Ableton Live so the app can read transport
state and drive Live (tempo, clips, tracks).

This document describes how the pieces fit together.

- [System context](#system-context)
- [The Tauri app](#the-tauri-app)
  - [Rust backend (native MIDI)](#rust-backend-native-midi)
  - [React frontend](#react-frontend)
- [Ableton integration](#ableton-integration)
  - [Path A — Max for Live device (primary)](#path-a--max-for-live-device-primary)
  - [Path B — AbletonMCP socket (LLM / scripting)](#path-b--abletonmcp-socket-llm--scripting)
- [Note sources, merged](#note-sources-merged)
- [Protocols](#protocols)
- [File map](#file-map)
- [Design decisions](#design-decisions)
- [Runtime checklist](#runtime-checklist)

---

## System context

There are three ways MIDI/Ableton data can reach ChordLens, and one way the app
reaches back into Ableton.

```mermaid
flowchart LR
  KB[MIDI keyboard / Push] -->|USB MIDI| RUST
  IAC[Ableton via IAC bus] -->|virtual MIDI| RUST

  subgraph APP["ChordLens Tauri app"]
    RUST[Rust backend<br/>midir] -->|midi-note event| FE[React frontend]
    FE -->|invoke| RUST
  end

  subgraph LIVE["Ableton Live"]
    M4L[ChordLens.amxd<br/>Max for Live device]
    MCP[AbletonMCP<br/>remote script]
  end

  M4L <-->|WebSocket :17999| FE
  MCP <-->|TCP/JSON :9877| EXT[External scripts / Claude]

  PLAY[Played notes] --> M4L
```

Two independent bridges into Live coexist (different ports, different
mechanisms):

| Bridge | Port | Transport | Who drives it | Live API access |
|--------|------|-----------|---------------|-----------------|
| **Max for Live device** | 17999 | WebSocket / JSON | the ChordLens frontend | official `LiveAPI` (v8) |
| **AbletonMCP remote script** | 9877 | TCP / JSON | external code, Claude (MCP) | `_Framework` control surface |

---

## The Tauri app

`chordlens-app/` is a [Tauri 2](https://tauri.app) desktop app: a Rust backend
(`src-tauri/`) hosting a system WebView that runs the React/TypeScript frontend
(`src/`). In a plain browser (`npm run dev`) the frontend still runs, but native
MIDI is unavailable — only demo mode and the WebSocket bridge work there.

### Rust backend (native MIDI)

`src-tauri/src/lib.rs` reads MIDI directly with [`midir`](https://crates.io/crates/midir)
— no helper process. It exposes three Tauri commands and emits one event.

```mermaid
sequenceDiagram
  participant FE as React frontend
  participant RS as Rust backend (midir)
  participant DEV as MIDI device

  FE->>RS: invoke("list_midi_inputs")
  RS-->>FE: ["IAC Driver Bus 1", "Push", …]
  FE->>RS: invoke("select_midi_input", {index})
  RS->>DEV: open port, register callback
  RS-->>FE: "port name"
  loop on every note
    DEV-->>RS: raw MIDI bytes
    RS-->>FE: emit("midi-note", {pitch, velocity})
  end
```

- **Commands:** `list_midi_inputs`, `select_midi_input(index)`,
  `disconnect_midi`.
- **Event:** `midi-note` → `{ pitch: u8, velocity: u8 }`. Note-off is
  normalized to `velocity: 0`. SysEx / clock / active-sensing are ignored.
- The open `MidiInputConnection` is kept in `MidiState(Mutex<…>)` so its callback
  thread stays alive; selecting a new input drops the previous connection.

### React frontend

`src/` is React 19 + TanStack Router, built by Vite. The chord/key logic is pure
functions in `src/lib/` (unit-tested with Vitest). State flows through hooks into
presentational view components.

```mermaid
flowchart TD
  subgraph hooks
    PM[usePushMidi<br/>IAC/keyboard + demo]
    AB[useAbleton<br/>M4L WebSocket]
    KE[useKeyEstimate]
    CH[useChordHistory]
  end

  PM -->|heldNotes| IDX[routes/index.tsx<br/>Visualizer]
  AB -->|heldNotes + transport| IDX
  IDX -->|merged pitches| MUSIC[lib/music.ts<br/>detectChord]
  IDX --> KE
  IDX --> CH
  MUSIC --> VIEWS
  IDX --> VIEWS[PianoView · FretboardView ×2 · NotationView]
  AB -.command helpers.-> IDX
```

- **`routes/index.tsx` (`Visualizer`)** is the composition root: it pulls notes
  from both input hooks, merges them, runs chord/key detection, and renders the
  views plus header chrome.
- **`lib/music.ts` / `lib/theory.ts`** — pitch→chord/key detection and roman
  numerals (provider-agnostic, fully tested).
- **`lib/config.ts`** — static MVP config (octave convention, tunings, ranges).

---

## Ableton integration

### Path A — Max for Live device (primary)

The `max-for-live/ChordLens.amxd` device runs **inside** Ableton and is the
app's main link to Live. It does two jobs: forward played MIDI to the app (no
IAC bus needed) and bridge the Live API for state + control.

The device is split across two scripts because of a hard platform constraint:

> Only the Max **`v8`/`js`** object can touch the **Live API**.
> Only **`node.script`** can host a **WebSocket** server.

So they run side by side and talk over Max messages inside the patch.

```mermaid
flowchart LR
  PLAY[MIDI from Live<br/>clips + input] --> MI[midiin]
  MI --> MO[midiout → instrument]
  MI --> MP[midiparse → prepend note]
  MP --> NODE

  subgraph AMXD["ChordLens.amxd"]
    NODE[node.script<br/>chordlens.server.js<br/>WebSocket :17999]
    V8[v8<br/>chordlens.v8.js<br/>LiveAPI]
    TD[live.thisdevice] -->|bang on load| V8
    NODE -->|cmd json| V8
    V8 -->|fromlive json| NODE
  end

  NODE <-->|WebSocket| FE[ChordLens frontend<br/>useAbleton]
  V8 <-->|observe + control| LIVEAPI[(Ableton<br/>Live API)]
```

Internal message contract (over Max patch cords):

- `node.script` → `v8`: `cmd <jsonString>` (a command from the app).
- `v8` → `node.script`: `fromlive <jsonString>` (an event or command reply).
- `midiin → midiparse → prepend note` → `node.script`: `note <pitch> <velocity>`.

Two non-obvious constraints this design works around (both cost real debugging):

- **Capture from `midiin`, not `notein`.** `notein` only receives physical MIDI
  *ports*, so it misses clip playback. `midiin` carries Live's track MIDI stream
  (clips + input). A parallel `midiin → midiout` keeps the device transparent to
  the instrument after it.
- **`LiveAPI` needs the two-arg form** `new LiveAPI(callback, path)`. In the
  `v8` object a lone string arg is taken as the callback, leaving the path unset
  (`get: no valid object set`). `chordlens.v8.js` wraps this in an `api()` helper.

`v8` registers `LiveAPI` observers for `is_playing` and `tempo` so changes are
**pushed** (no polling), and runs commands via `LiveAPI.call/set` against
`live_set …` paths. `node.script` caches the last session/transport so a freshly
connected client gets state immediately.

On the app side, **`useAbleton`** (`src/hooks/useAbleton.ts`) wraps the
auto-reconnecting **`AbletonBridge`** client (`src/lib/ableton.ts`) and exposes
`connected`, `session`, `tempo`, `isPlaying`, `heldNotes`/`pitches`, plus typed
command helpers (`setTempo`, `fireClip`, `createMidiTrack`, …). The
**`AbletonStatus`** header chip surfaces connection + tempo and a transport
play/stop toggle.

See [`max-for-live/README.md`](../max-for-live/README.md) for the device build
steps and full WebSocket protocol.

### Path B — AbletonMCP socket (LLM / scripting)

[AbletonMCP](https://github.com/ahujasid/ableton-mcp) is an **independent**
integration used for LLM/automation, not by the ChordLens UI. Its remote script
(installed into Ableton's `MIDI Remote Scripts`) opens a TCP server on **9877**
speaking JSON `{type, params}`. The `ableton-mcp` Python package is one client
(bridging MCP ↔ socket for Claude Desktop); any external program can be another.

```mermaid
flowchart LR
  CLAUDE[Claude Desktop] -->|MCP| PKG[ableton-mcp<br/>python]
  SCRIPT[Your scripts] --> SOCK
  PKG --> SOCK[(TCP :9877)]
  SOCK --> RSC[AbletonMCP remote script] --> LOM[(Live API)]
```

This path is documented for completeness and for ad-hoc scripting. ChordLens
features should use **Path A**, which is more native (official Live API,
observers, no app-bundle install, no IAC bus).

---

## Note sources, merged

The visualizer treats any of three note sources interchangeably. They are
unioned in `routes/index.tsx` so a held pitch from any source lights the views:

```mermaid
flowchart LR
  A[Keyboard / IAC<br/>usePushMidi] --> M{union}
  B[Demo mode<br/>usePushMidi] --> M
  C[M4L device<br/>useAbleton] --> M
  M --> P[sorted pitches] --> D[detectChord / key / views]
```

```ts
const heldNotes = useMemo(() => {
  if (live.heldNotes.size === 0) return midiHeld
  if (midiHeld.size === 0) return live.heldNotes
  const merged = new Set(midiHeld)
  live.heldNotes.forEach((n) => merged.add(n))
  return merged
}, [midiHeld, live.heldNotes])
```

---

## Protocols

### `midi-note` (Rust → frontend, Tauri event)
`{ pitch: number, velocity: number }` — `velocity: 0` means note-off.

### Max for Live WebSocket (device ⇄ frontend, `ws://127.0.0.1:17999`)
JSON, one object per message. Authoritative reference in
[`max-for-live/README.md`](../max-for-live/README.md).

- **Device → app events:** `hello`, `note`, `transport`, `tempo`, `session`,
  `error`.
- **App → device commands:** `get_session`, `set_tempo`, `start_playback`,
  `stop_playback`, `create_midi_track`, `set_track_name`, `fire_clip`,
  `stop_clip`, `get_track_info`. An optional numeric `id` yields a
  `{id, ok, result}` / `{id, error}` reply.

### AbletonMCP socket (clients ⇄ remote script, `tcp://localhost:9877`)
Request `{ "type": <cmd>, "params": {…} }` → response
`{ "status": "success"|"error", "result"|"message" }`. One request/response per
connection (naïve buffer framing).

---

## File map

```
first-ableton-app/
├─ chordlens-app/                 # the Tauri desktop app
│  ├─ src-tauri/src/lib.rs        # Rust: native MIDI (midir) → "midi-note" event
│  └─ src/
│     ├─ routes/index.tsx         # Visualizer — composition root, note merge
│     ├─ hooks/
│     │  ├─ usePushMidi.ts        # IAC/keyboard + demo note source
│     │  └─ useAbleton.ts         # Max for Live WebSocket bridge (React)
│     ├─ lib/
│     │  ├─ ableton.ts            # AbletonBridge WebSocket client + types
│     │  ├─ music.ts / theory.ts  # chord/key detection (pure, tested)
│     │  └─ config.ts             # static MVP config
│     └─ components/
│        ├─ AbletonStatus.tsx     # header chip: connection + tempo + transport
│        ├─ StatusIndicator.tsx   # MIDI input status
│        └─ {Piano,Fretboard,Notation}View.tsx, …
├─ max-for-live/                  # the Ableton-side device (Path A)
│  ├─ ChordLens.maxpat            # patch wiring (assemble → ChordLens.amxd)
│  ├─ chordlens.v8.js             # LiveAPI: observe + control (v8 object)
│  ├─ chordlens.server.js         # WebSocket server + bridge (node.script)
│  ├─ package.json                # ws dependency
│  └─ README.md                   # device build steps + protocol
├─ docs/                          # this documentation
└─ resources/                     # product / requirements / spec notes
```

---

## Design decisions

- **Native MIDI in Rust, not WebMIDI.** The desktop build reads MIDI directly
  via `midir` with no helper process or browser permission prompts; the frontend
  just consumes `midi-note` events.
- **Max for Live over the MCP socket for app features.** M4L uses the official
  Live API (with observers), sees played notes directly (no IAC bus), needs no
  app-bundle install, and is stable across Live updates. The MCP socket is kept
  only for external/LLM scripting. (See `docs/` discussion / commit history.)
- **Two JS files in the device.** Forced by the platform: LiveAPI lives in `v8`,
  WebSocket hosting lives in `node.script`; they bridge over Max messages.
- **Merged note sources.** The visualizer is agnostic to where notes come from,
  so keyboard, demo, and the M4L device all "just work" and even combine.
- **Auto-reconnecting bridge.** `AbletonBridge` retries, so app/Ableton launch
  order doesn't matter and the UI degrades gracefully when Live is closed.
- **Local-only by default.** Both the WebSocket (`127.0.0.1`) and the MCP socket
  are intended for local use; neither has auth.

---

## Runtime checklist

To run the full system:

1. **Build the device once:** assemble `max-for-live/ChordLens.amxd` (see its
   README) and `npm install` in `max-for-live/`.
2. **In Ableton:** drop `ChordLens.amxd` on a MIDI track; the Max console should
   print `ChordLens WebSocket listening on ws://127.0.0.1:17999`.
3. **Run the app:** `cd chordlens-app && npm run desktop` (native MIDI) or
   `npm run dev` (browser; WebSocket bridge + demo only).
4. The `AbletonStatus` chip connects automatically; play into the device or a
   selected MIDI input and the views light up.
```
