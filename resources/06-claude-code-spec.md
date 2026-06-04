# ChordLens — Claude Code Build Spec

> Self-contained build spec for a Claude Code agent. Everything needed to build the v1 POC is in this file.

## Project overview
ChordLens is a real-time visualizer that mirrors what a producer plays on an Ableton Push controller across four synchronized instrument views: a piano keyboard, a guitar fretboard, a bass fretboard, and standard music notation (grand staff). It is a local, always-on "second screen" companion to Ableton Live. **One-liner:** see the notes and chords you play on Push rendered four ways at once, in real time.

The product has **two pieces**:
1. A **Max for Live device** that taps the notes Live is producing and broadcasts them over a local WebSocket.
2. A **TanStack Start (React + TypeScript) web app** that connects to that WebSocket and renders the four views.

They are built as two clean pieces connected by a documented contract, so they can later be packaged as a single product (hybrid delivery). v1 = passive, zero-UI mirror with sensible defaults.

## Stack
- **Frontend:** TanStack Start + React + TypeScript
- **Notation:** VexFlow (live grand-staff chord rendering)
- **Music theory / chord detection:** tonal (`Chord.detect`, `Note`, `Interval`)
- **Piano/guitar/bass rendering:** SVG via React components
- **Device side:** Max for Live MIDI-effect device + Node for Max (`node.script`) running a `ws` WebSocket server
- **Hosting:** local only (`http://localhost`), no cloud, no DB, no auth
- **Styling:** plain CSS / CSS modules (Tailwind optional)

## Setup commands
```bash
# 1. Web app
npx create-tsrouter-app@latest chordlens-app
#   choose: Start (full-stack), TypeScript; Tailwind optional
cd chordlens-app
npm install vexflow tonal
npm run dev          # serves http://localhost:3000

# 2. Device server deps (in the M4L device's project folder, created in Max)
#   after creating the .amxd and its project folder:
npm init -y
npm install ws
```

## Folder structure
```
chordlens/
├── chordlens-app/                 # TanStack Start web app
│   └── src/
│       ├── routes/
│       │   └── index.tsx          # the single visualizer route "/"
│       ├── hooks/
│       │   └── usePushMidi.ts      # client-only WebSocket + held-note state + demo mode
│       ├── components/
│       │   ├── PianoView.tsx       # primary, polished SVG keyboard
│       │   ├── FretboardView.tsx   # reused for guitar AND bass
│       │   ├── NotationView.tsx    # VexFlow grand staff + chord symbol
│       │   └── StatusIndicator.tsx
│       ├── lib/
│       │   ├── music.ts            # tonal wrappers: detectChord, noteName, pitchClass, fret math
│       │   └── config.ts           # constants (tunings, ranges, WS_URL, octave convention)
│       └── styles.css
└── chordlens-device/              # Max for Live device project folder
    ├── ChordLens.amxd             # the device (built in Max)
    ├── chordlens-server.js        # Node for Max WebSocket server
    └── package.json               # has "ws" dependency
```

## Configuration constants (`src/lib/config.ts`)
```ts
export const WS_URL = 'ws://localhost:8080'
export const OCTAVE_OFFSET = -2            // C3 = MIDI 60 (Ableton default): NAMES[p%12] + (floor(p/12) + OCTAVE_OFFSET)
export const GUITAR_TUNING = [40,45,50,55,59,64]  // E2 A2 D3 G3 B3 E4
export const BASS_TUNING   = [28,33,38,43]        // E1 A1 D2 G2
export const FRET_COUNT = 15
export const PIANO_LOW = 36                 // C2
export const PIANO_HIGH = 84                // C6
export const CLEF_SPLIT = 60                // middle C: >= treble, < bass
```

## Build order

### Milestone 1: Web app scaffold + held-note state + demo mode
**Goal:** App runs, has the four-view layout shell, and can simulate held notes without the device.
**Tasks:**
- [ ] Scaffold TanStack Start app; create the `/` route with the layout shell (piano top/hero, guitar + bass + notation below).
- [ ] Build `usePushMidi()` with the `HeldNotes` `Set<number>`, connection status, and a **demo mode** that cycles sample chords (for development without Push/Live).
- [ ] Build `StatusIndicator` (connected / reconnecting / demo).
- [ ] Build `lib/config.ts` and `lib/music.ts` (tonal wrappers: `detectChord`, `noteName`, `pitchClass`, `fretPositionsFor`).
**Done when:** running the app in demo mode shows held-note state changing on a timer, with the layout shell in place.

### Milestone 2: PianoView (primary)
**Goal:** Polished, correct SVG keyboard that highlights held notes.
**Tasks:**
- [ ] Render white/black keys across `PIANO_LOW`–`PIANO_HIGH` with correct geometry.
- [ ] Highlight every key whose pitch ∈ `HeldNotes`.
- [ ] Verify against demo chords.
**Done when:** demo chords light the correct keys across the range; this view looks finished.

### Milestone 3: FretboardView (guitar + bass)
**Goal:** One reusable component lighting all positions of held notes on a neck.
**Tasks:**
- [ ] `FretboardView({ tuning, fretCount, heldNotes })`: draw strings × frets.
- [ ] For each string/fret, compute resulting pitch; light it if its pitch-class matches any held note's pitch-class (v1 = all positions, no cycling).
- [ ] Render twice: guitar (`GUITAR_TUNING`) and bass (`BASS_TUNING`).
**Done when:** demo chords light all correct fret positions on both necks in standard tuning.

### Milestone 4: NotationView (VexFlow)
**Goal:** Live grand staff with chord symbol.
**Tasks:**
- [ ] Render a grand staff (treble + bass) with VexFlow.
- [ ] Render held notes as one chord, splitting pitches across clefs at `CLEF_SPLIT`; accidentals = sharps.
- [ ] Show `chordSymbol` (from `detectChord`) above the staff.
- [ ] Re-render on each `HeldNotes` change.
**Done when:** demo chords display correctly on the grand staff with the right chord symbol.

### Milestone 5: Max for Live device + live connection
**Goal:** Real notes from Push flow into the app.
**Tasks:**
- [ ] Build the M4L MIDI-effect device: `notein → pack i i → prepend note → node.script chordlens-server.js`.
- [ ] Write `chordlens-server.js`: `ws` server on :8080, track clients, broadcast `{pitch, velocity}` per note event.
- [ ] `npm install ws` in the device project folder.
- [ ] Confirm the app (served over `http://localhost`) connects, status goes green, and playing Push updates all four views live; verify device does not block MIDI to the instrument.
**Done when:** playing a chord on Push (through Live) updates piano, guitar, bass, and notation in real time.

### Milestone 6 (final): Hybrid packaging
**Goal:** Make the two pieces feel like one product.
**Tasks:**
- [ ] Decide and implement a launch story (e.g., M4L device opens the app URL, or a simple bundled launcher).
- [ ] Document install steps for a non-technical Push user.
**Done when:** a new Push user can get from "install" to "four live views" with minimal steps.

## Data model (wire contract)
Device → app, one JSON message per note event:
```json
{ "pitch": 60, "velocity": 100 }
```
- `pitch`: MIDI note 0–127 (Live-processed pitch).
- `velocity`: 0–127; **`> 0` = note-on, `=== 0` = note-off.**
- No timestamps/channels in v1 (reserved for v2).

App in-memory: `HeldNotes = Set<number>`; on message, `velocity>0` adds `pitch`, else deletes it. Derived per change: sorted pitches, pitch-classes, `detectChord` result.

## Key handler signatures (`src/lib/music.ts`)
```ts
detectChord(pitches: number[]): { chordSymbol: string | null; noteNames: string[]; bassPc: number } | null
noteName(pitch: number): string          // e.g. "C4" (C3=60 convention)
pitchClass(pitch: number): number         // 0–11
fretPositionsFor(heldNotes: Set<number>, tuning: number[], fretCount: number): Array<{string:number; fret:number}>
```

## Pages & components
- **Route `/`** — single visualizer page; renders from `HeldNotes`; no controls.
  - `PianoView` (hero, top) — SVG keyboard, highlights held keys. **Must be polished.**
  - `FretboardView` ×2 — guitar then bass; all held-note positions lit; standard tuning.
  - `NotationView` — VexFlow grand staff + chord symbol; sharps; re-renders live.
  - `StatusIndicator` — connection state.
- **Device** — `ChordLens.amxd` + `chordlens-server.js`.

## Environment variables
- None required for v1 (WS URL/port are constants). Optional future: `VITE_WS_URL`, `CHORDLENS_WS_PORT`.

## POC acceptance criteria
- [ ] App runs locally and shows the four-view layout (piano hero on top).
- [ ] In **demo mode**, all four views update from simulated chords (dev without hardware).
- [ ] The **M4L device** broadcasts note-on/off from Live over WebSocket on :8080 without blocking MIDI to the instrument.
- [ ] Playing a chord on **Push** updates **all four views in real time** with low, immediate-feeling latency.
- [ ] Piano view is accurate and polished across the configured range.
- [ ] Guitar & bass show **all** correct positions in standard tuning.
- [ ] Notation shows the chord on a grand staff (sharps) with a correct chord symbol where one is detected.
- [ ] App auto-reconnects if the device/connection drops and returns.
- [ ] **Core loop works end-to-end:** play on Push → glance → see all four synchronized views → keep playing.

## Open questions / parked items (v2)
- Playback visualization of recorded clips synced to Live's transport (this is where **OSMD** replaces/supplements VexFlow).
- Cycling/selecting guitar & bass fingerings (v1 shows all positions).
- Key/scale awareness and correct enharmonic spelling (v1 = sharps).
- Alternate tunings (drop D, 5-string bass, custom).
- Any settings/controls UI (view toggles, handedness, octave convention, ranges).
- Saving/exporting progressions or notation (where TanStack Start server functions come in).
- Left-handed layouts.
- Tightest hybrid packaging (auto-launch / single installer) beyond the basic launch story in Milestone 6.
