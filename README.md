# ChordLens

A real-time visualizer that mirrors what you play on an Ableton **Push** controller across **four instrument views at once** — piano keyboard, guitar fretboard, bass fretboard, and standard music notation.

Play a chord on Push and immediately *see* it four ways: where it sits on a piano, how to finger it on guitar and bass, and how it's written on a grand staff — plus a Push-style chromatic pad grid and the played progression written out as a sheet. It's an always-on "second screen" companion to Ableton Live. With the optional **Max for Live device** it goes **two-way**: it also reads Ableton's **key, tempo, and transport**, and can **drive Live** (play/stop, set tempo, fire clips) — all over a local WebSocket, no IAC routing.

![ChordLens showing an Fmaj7 chord across piano, guitar, bass, and notation, with the progression strip and key readout](docs/chordlens-features.png)

---

## Features

- **Four synchronized views** — piano keyboard (hero), guitar fretboard, bass fretboard, and a grand-staff notation view, all reflecting the held notes in real time.
- **A color per note** — each pitch has its own color, shared across *every* view (including the noteheads), so the same note is instantly recognizable on piano, guitar, bass, and the staff.
- **Live chord detection** — the detected chord symbol shows above the keyboard and on the staff (e.g. `Cmaj7`, `Am`, `G/B`).
- **Chord progression history** — a strip records the chords you settle on (`C · Am · Fmaj7`), each chip tinted by its root; **Clear** to reset.
- **Key & scale awareness** — auto-detects the key (with a manual override), shows the chord's **Roman numeral** (e.g. `IIm7 · V7 · I`), spells accidentals to match the key (sharps or flats), and flags **out-of-key** notes with a dashed outline. With the Max for Live bridge it can **pull the key straight from Ableton**.
- **Fretboard positions** — guitar and bass show the chord as a single playable **position box** (not scattered across the neck) with **◀ ▶ / Auto** to move it, **All** to see the whole neck, and **1×** for one dot per note.
- **Guitar chord shapes** — **Chord** mode answers "what do I actually grab?": it searches real fingerings for the detected chord, keeps the ones a hand can hold, and draws the **three most useful positions at once**, each boxed and labelled, with barres marked. The arrows walk further up the neck. The CAGED shapes fall out of the search — C gives `x32010` / `x35553` / `8aa988`.
- **Note names** — a **Names** toggle on each view letters every position on it (independently per view), always spelled with sharps. On the necks the in-key letters are lit, so you can read the scale shape across the whole fretboard.
- **Several tracks at once** — put the Max for Live device on as many tracks as you like. They elect a hub so the app keeps one connection but sees every track, and a **track tab bar** appears above the views to follow one or fold them all together.
- **Push view** — an 8×8 chromatic pad grid mirroring Ableton Push, with the scale highlighted.
- **Progression sheet** — the played progression written out as notation below the piano.
- **Scale overlay** — the **Scale** toggle faintly traces the whole detected key across the piano and both fretboards, so you can see where your chord sits within the scale (played notes stay bold on top).
- **Pin / freeze a voicing** — press **Space** (or the **Pin** button) to freeze the current chord so you can study its shapes after letting go.
- **Demo mode** — cycles sample chords so you can see everything without any MIDI connected.

---

## How it works

ChordLens is a **Tauri desktop app** (Rust backend + React UI). There are two ways to feed it from Ableton — use either, or both:

**1. MIDI in (always available).** The Rust backend opens a MIDI input directly with [`midir`](https://github.com/Boddlnagg/midir) and streams note events to the UI — your controller, or Ableton via a virtual MIDI bus (macOS **IAC**). No helper process.

```
  MIDI ──▶ Rust backend (midir) ──{pitch,velocity}──▶ React UI
  (controller / IAC)                                  piano · guitar · bass · notation · Push · sheet
```

**2. Max for Live bridge (two-way).** The optional **ChordLens device** runs *inside* Ableton and connects to the app over a local **WebSocket** (`:17999`). It taps the track's MIDI (clip playback included — no IAC) and bridges the **Live API in both directions**:

```
            ┌──────────────── ChordLens.amxd (in Ableton) ────────────────┐
 Ableton ⇄  │  Live API  ·  WebSocket server :17999                        │ ⇄  React UI
            └─────────────────────────────────────────────────────────────┘
   read  →  notes · song key · tempo · transport
   write ←  set tempo · fire clips · play / stop · create track
```

So with the device the app not only *sees* what's happening in Ableton (notes, key, tempo, transport) but can *drive* it. The device is **dependency-free** (the WebSocket server uses Node's built-ins — no `npm install`, no `node_modules`); the app's frontend is the WebSocket client. See [`max-for-live/README.md`](max-for-live/README.md).

Note event shape (`{ pitch, velocity }`): `pitch` is a MIDI note 0–127, `velocity > 0` is a note-on, `velocity 0` is a note-off.

> **Which path?** A plugged-in MIDI keyboard needs zero setup — pick it and play. For Ableton you can either route a track to **IAC** (notes only, see [Visualizing Ableton](#visualizing-ableton-live-via-iac)) or drop the **Max for Live device** (notes + key + transport + control, no IAC). The Max bridge is the richer, no-routing option.

---

## Quick start (desktop app)

```bash
cd chordlens-app
npm install            # first time only
npm run desktop        # builds + launches the ChordLens desktop app (tauri dev)
```

A native window opens with the four-view layout. Top-right:

- Pick a **MIDI input** from the dropdown (your keyboard, or an IAC bus from Ableton) and play — the views light up.
- No MIDI handy? Click **Demo** to cycle sample chords and see all four views update.

To produce a distributable, double-click app bundle (`.app` / `.dmg`):

```bash
npm run desktop:build  # outputs to src-tauri/target/release/bundle/
```

<a id="visualizing-ableton-live-via-iac"></a>
### Visualizing Ableton Live (via IAC)

Ableton doesn't expose its notes to other apps unless you route them out. On macOS the built-in **IAC Driver** is a virtual MIDI cable for exactly this.

**1. Turn on the IAC bus (one-time):**
1. Open **Audio MIDI Setup** → menu **Window → Show MIDI Studio** (⌘2).
2. Double-click the **IAC Driver** icon.
3. Tick **"Device is online"** (a dimmed/red icon means it's off), confirm a port named **Bus 1** exists (add one with **+** if empty), click **Apply**.

**2. Enable the port in Ableton (one-time):**
- Live → **Settings → Link, Tempo & MIDI** → under **MIDI Ports**, set **Output: IAC Driver (Bus 1) → Track = On**.

**3. Route your track's MIDI to it:**
- Select the track you play into → set **MIDI To → IAC Driver (Bus 1)**, channel **1**, and **Monitor → In**.
- ⚠️ Routing a track's MIDI to IAC sends it *out* instead of to that track's instrument, so the track goes silent. To **hear sound and see it**, add a second MIDI track: **MIDI From → [instrument track]**, **Monitor: In**, **MIDI To → IAC Driver (Bus 1)**. The second track is a silent tap for ChordLens.

**4. Pick it in ChordLens:**
- Click **↻** next to the MIDI-input dropdown (it re-scans), then choose **IAC Driver Bus 1**. Play — the views light up.

> A plugged-in USB MIDI keyboard skips all of this: just pick it in the dropdown and play.

### Connect Ableton via Max for Live (optional, no IAC bus)

Instead of the IAC routing above, you can drop the **ChordLens Max for Live
device** on a track. It taps the track's MIDI directly (clip playback included)
and bridges Ableton's **Live API**, so ChordLens additionally shows live
**tempo / transport**, pulls the **song key**, and can **control Live**
(play/stop, set tempo, fire clips). The app talks to the device over a local
WebSocket (`:17999`); the **Ableton** chip in the header turns green when
connected (with a **↻** button to reconnect).

The device is **dependency-free** — the WebSocket server uses Node's built-ins,
so there's **no `npm install`, no `node_modules`**. Setup is a one-time
paste-and-save in the Max editor (then optionally **Freeze** for a portable,
self-contained device) — see **[`max-for-live/README.md`](max-for-live/README.md)**
for the full steps, protocol, and how to extend it.

| | IAC bus | Max for Live device |
|---|---|---|
| Shows played/clip notes | ✅ | ✅ (no IAC needed) |
| Live tempo / transport | ❌ | ✅ |
| Song key sync | ❌ | ✅ |
| Control Ableton from the app | ❌ | ✅ |
| Setup | macOS MIDI routing | paste device once (no npm install) |

---

## Configuration

Musical settings are constants in [`chordlens-app/src/lib/config.ts`](chordlens-app/src/lib/config.ts) (runtime controls are the MIDI input picker, key override, pin, and demo toggle):

| Constant | Default | Meaning |
|----------|---------|---------|
| `OCTAVE_OFFSET` | `-2` | C3 = MIDI 60 (Ableton default). Set to `-1` if your Live uses C4 = 60. |
| `GUITAR_TUNING` | `E2 A2 D3 G3 B3 E4` | Standard 6-string. |
| `BASS_TUNING` | `E1 A1 D2 G2` | Standard 4-string. |
| `FRET_COUNT` | `15` | Frets drawn per neck. |
| `PIANO_LOW` / `PIANO_HIGH` | `36` / `84` | Keyboard span (C2–C6). |
| `CLEF_SPLIT` | `60` | Notes ≥ this go to the treble clef, below to bass. |

Accidentals are spelled **sharps or flats to match the detected/selected key**. (Per-*note* enharmonic correctness within a key is still simplified — see Scope.)

---

## Project layout

```
chordlens-app/                  # Tauri desktop app (React UI + Rust backend)
  src/                          # React frontend (the four views)
    routes/index.tsx            # the single visualizer route "/" (wires every feature)
    hooks/
      usePushMidi.ts            # MIDI source: Tauri events from the Rust backend + demo mode
      useAbleton.ts             # optional Max for Live bridge (WebSocket): notes + transport + control
      useKeyEstimate.ts         # auto key detection (+ manual override)
      useChordHistory.ts        # records settled chords for the progression strip
    components/
      PianoView.tsx             # SVG keyboard (hero view)
      PushView.tsx              # 8x8 Push-style chromatic pad grid
      FretboardView.tsx         # guitar AND bass: position box + ◀▶/Auto/All/1×
      NotationView.tsx          # VexFlow grand staff + chord symbol (current chord)
      ProgressionStrip.tsx      # chord history chips (chords / notes toggle)
      ProgressionStaff.tsx      # the progression written out on a grand staff
      KeyBadge.tsx              # detected/Ableton key + manual override
      StatusIndicator.tsx       # listening / demo state
      AbletonStatus.tsx         # Max for Live connection + tempo + transport + reconnect
      InputPicker.tsx           # MIDI input chooser
    lib/
      music.ts                  # tonal wrappers: detectChord, fret positions, shape windows
      theory.ts                 # key estimation/sync, scale, Roman numerals, spelling
      ableton.ts                # AbletonBridge: auto-reconnecting WebSocket client + typed commands
      colors.ts                 # one color per pitch-class (shared by all views)
      config.ts                 # constants (tunings, ranges, Push grid, octave convention)
      *.test.ts                 # unit tests for music + theory
  src-tauri/                    # Rust backend
    src/lib.rs                  # midir MIDI reader; emits "midi-note" events; commands
    examples/list_midi.rs       # standalone MIDI-port enumeration check
    Cargo.toml, tauri.conf.json # Rust deps + app/window/bundle config
max-for-live/                   # optional Ableton bridge device — dependency-free (see its README)
  ChordLens.maxpat              # patch source (paste → ChordLens.amxd)
  chordlens.v8.js               # LiveAPI: observe transport/tempo/key + run commands
  chordlens.server.js           # dependency-free WebSocket server (node.script) on :17999
docs/architecture.md            # full system architecture + diagrams
```

## Tech stack

- **Desktop shell:** [Tauri](https://tauri.app/) v2 — Rust backend, system WebView, small (~10 MB) bundle.
- **MIDI:** [`midir`](https://github.com/Boddlnagg/midir) (Rust) reads input ports on the backend and emits `midi-note` events to the UI. No cloud, no DB, no auth.
- **UI:** TanStack Router + React + TypeScript (Vite).
- **Notation:** [VexFlow](https://www.vexflow.com/) (live grand-staff chord rendering).
- **Music theory:** [tonal](https://github.com/tonaljs/tonal) — `Chord.detect` for chords, `Key`/`Scale`/`Progression` for key detection, scales, and Roman numerals.
- **Piano / guitar / bass:** plain SVG driven by React state.

## Requirements

- **Run the desktop app / build from source:** [Rust toolchain](https://rustup.rs/) + Xcode Command Line Tools (macOS), and Node 18+.
- **Visualize Ableton:** macOS (uses the built-in IAC Driver). A USB MIDI keyboard needs no extra setup on any platform Tauri supports.

## Testing

```bash
cd chordlens-app
npm test             # runs the music-logic unit tests (vitest)
```

The chord-detection, note-naming, and fretboard-position logic in `lib/music.ts` is covered by unit tests.

---

## Scope

Started as a passive real-time mirror; the Features above (color, progression history, key awareness, pin) have since been added. Still **parked**:

- Playback visualization of recorded clips synced to Live's transport (where [OSMD](https://opensheetmusicdisplay.org/) would replace VexFlow).
- True chord-shape *fingerings* (CAGED voicings). Fretboards now show a **position box** (◀▶ / Auto / All / 1×) rather than scattering every match, but not a single curated one-note-per-string shape.
- Per-note "correct" enharmonic spelling within a key (currently spells sharps or flats per the key signature, not per individual note).
- Alternate tunings (drop D, 5-string bass, custom).
- Saving / exporting progressions or notation (where TanStack server functions would come in).
- Left-handed layouts.
- Tightest hybrid packaging (auto-launch / single installer / signing).

> **Notes on the architecture vs. the original spec:**
> - The spec described a browser web app fed by a Max for Live device over WebSocket. To make it **install-once / standalone**, the core app is a **Tauri desktop app** that reads MIDI natively in Rust (no required helper process; MIDI is read in the Rust backend, *not* via the browser Web MIDI API — macOS's WebView doesn't support Web MIDI).
> - The **Max for Live device is back as an _optional_ bridge** (`max-for-live/`): it adds no-IAC note capture plus Live API features (tempo/transport readout and control) over a local WebSocket. It's not required to run ChordLens — the IAC route and plain MIDI keyboards work without it. See [`docs/architecture.md`](docs/architecture.md).
> - The frontend is TanStack **Router** (client-side SPA), not TanStack **Start**. v1 needs no SSR/server functions; Start can be layered in for v2's saving/playback features.
