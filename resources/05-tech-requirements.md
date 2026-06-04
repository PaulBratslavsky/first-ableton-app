# Technical Requirements

The engineering blueprint for ChordLens v1. Two deliverables: (1) the **Max for Live device** that emits notes, and (2) the **TanStack Start web app** that renders four views. They communicate over a local WebSocket using the contract below.

---

## Data models

v1 has no database. "Models" here are the in-memory/in-flight shapes the two pieces agree on.

### Wire message (device → app)
The only thing crossing the seam. One message per note event.

| Field | Type | Notes |
|-------|------|-------|
| `pitch` | number (int) | MIDI note number, 0–127. Live-processed pitch (not a raw pad index). |
| `velocity` | number (int) | 0–127. **`velocity > 0` = note-on; `velocity === 0` = note-off.** |

- Encoding: JSON string, e.g. `{"pitch":60,"velocity":100}`.
- No timestamps, channels, or note-IDs in v1 (not needed for a held-note mirror). Reserved for v2.
- Optional future fields (v2, ignored if absent): `channel`, `source`, `t` (timestamp).

### HeldNotes (app, in-memory)
- Representation: `Set<number>` of currently-sounding MIDI pitches.
- Transitions: note-on adds `pitch`; note-off deletes `pitch`.
- Derived on each change (recomputed, not stored): sorted pitch array, pitch-class set, detected chord.

### DerivedChord (app, computed via tonal)
| Field | Type | Notes |
|-------|------|-------|
| `pitches` | number[] | Sorted held MIDI pitches. |
| `noteNames` | string[] | e.g. `["C4","E4","G4"]` (sharps default; C3=60 convention noted in config). |
| `chordSymbol` | string \| null | From `tonal` `Chord.detect`; first/best match, or null if none. |
| `bassPc` | number | Lowest pitch's pitch-class, for slash-chord display. |

### Static config (app constants, not user-editable in v1)
- `OCTAVE_CONVENTION`: C3 = MIDI 60 (Ableton default). *(Judgment call — flag if your Live is set to C4=60; changes note-name labels only.)*
- `GUITAR_TUNING`: `[40,45,50,55,59,64]` (E2 A2 D3 G3 B3 E4), 6 strings.
- `BASS_TUNING`: `[28,33,38,43]` (E1 A1 D2 G2), 4 strings.
- `FRET_COUNT`: 15 *(judgment call — enough to show most voicings without a huge neck; adjustable).*
- `PIANO_RANGE`: C2–C6 (4 octaves) *(judgment call — wide enough for Push's usable range; adjustable).*
- `ACCIDENTALS`: sharps.
- `WS_URL`: `ws://localhost:8080`.

---

## The Max for Live device (deliverable 1)

A MIDI-effect device (`.amxd`) placed on the track Push plays into.

**Patch (object chain):**
- `notein` → `pack i i` (pitch + velocity) → `prepend note` → `node.script chordlens-server.js`

**`chordlens-server.js` (Node for Max):**
- Starts a WebSocket server on port 8080.
- Maintains a list of connected clients; cleans up on disconnect.
- On each `note <pitch> <velocity>` message from the patch inlet, broadcasts `{pitch, velocity}` JSON to all clients.
- Requires `ws` npm package installed in the device's project folder.

**Behavior requirements:**
- Must not consume/block MIDI — notes still pass to the instrument downstream (MIDI effect sits before the instrument; `notein` taps, doesn't intercept).
- Server starts on device load; tolerates the app connecting/disconnecting/reconnecting at any time.

---

## Web app (deliverable 2)

### Pages & routes
v1 is a single route.

#### `/` — the visualizer (index route)
- Purpose: the always-on four-view mirror.
- Layout: piano view (top, largest — it's the primary view), then guitar fretboard, bass fretboard, and notation stacked/arranged below; a small connection-status indicator.
- Renders entirely from `HeldNotes` state; no controls in v1.

### Key components

#### `usePushMidi()` (hook)
- Owns the WebSocket connection inside `useEffect` (client-only — never runs during SSR).
- Maintains the `HeldNotes` set; exposes the sorted pitch array, connection status, and (kept from prototype) an optional demo mode for testing without the device.
- Auto-reconnects on close (e.g., 1.5s retry).

#### `PianoView` *(primary, must be polished)*
- SVG keyboard spanning `PIANO_RANGE`.
- Highlights every key whose pitch is in `HeldNotes`.
- Correct white/black key geometry.

#### `FretboardView` (reused for guitar and bass)
- Props: `tuning: number[]`, `fretCount`, `heldNotes`.
- Draws strings × frets; lights **every** fret position whose resulting pitch's pitch-class matches a held note's pitch-class (v1 = all positions, no single-fingering, no cycling).
- Instantiated twice: `GUITAR_TUNING` and `BASS_TUNING`.

#### `NotationView`
- Uses **VexFlow** to render a **grand staff** (treble + bass clef).
- Renders the held notes as a single chord (no rhythm/measures), splitting pitches across clefs by a split point (~middle C).
- Shows the `chordSymbol` (from `DerivedChord`) above the staff.
- Accidentals: sharps.
- Re-renders on each `HeldNotes` change.

#### `StatusIndicator`
- Shows connected / disconnected (reconnecting) / demo.

### Shared logic (framework-agnostic module)
- `lib/music.ts`: wraps `tonal` — `detectChord(pitches)`, `noteName(pitch)`, `pitchClass(pitch)`, fret-position computation. Pure functions, unit-testable, reusable by any view (and by future server functions in v2).

---

## State management
- All v1 state is transient and client-side: the `HeldNotes` set in `usePushMidi`, plus derived values recomputed per change.
- No server state, no global store, no persistence. (TanStack Start server functions remain unused in v1 — reserved for v2 saving/playback.)

## Background jobs
- None in v1.

## Environment variables
- None required for v1 (the WebSocket URL/port are constants). If later made configurable: `VITE_WS_URL` (app), `CHORDLENS_WS_PORT` (device script). Not used in v1.

---

## Judgment calls to confirm
1. **Octave convention** C3=60 (Ableton default) — fine, or is your Live set to C4=60?
2. **Fret count 15** and **piano range C2–C6** — sensible defaults, or different ranges?
3. **Notation clef split at middle C** — standard; fine?
4. **Layout** — piano on top as the hero view, others below. Agree, or a different arrangement (e.g., 2×2 grid)?
