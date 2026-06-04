# Tech Decisions

For each decision: what was chosen, what else was considered, and why it fits the requirements.

## Product shape / architecture
- **Choice**: Hybrid — a **Max for Live device** that captures notes from Live and sends them to a **companion web app** that renders the four views. Designed from the start to be packaged as one product, but built as two cleanly-separated pieces connected by a well-defined seam.
- **Considered**: (A) Companion web app + M4L bridge, built ad-hoc; (B) Pure Max for Live device with everything drawn in Max; (C) Hybrid built for packaging from day one.
- **Why**: The "full grand staff + chord symbol" requirement is the heaviest factor and is far easier on the web (mature notation libraries) than hand-drawn in Max's `jsui`/`v8ui`. The user is fluent in JavaScript. The v2 list (playback, saving) is web-shaped. "Anyone using Push / clean install" is the one pull toward native, and the hybrid path preserves that as a goal while keeping the build in web tech. Built as two pieces so packaging can wrap them later without a rewrite.

## How Push notes reach the app
- **Choice**: A small Max for Live MIDI-effect device sits in the track chain, reads notes via `notein`, and a `node.script` (Node for Max) process runs a **WebSocket server** that broadcasts note-on/note-off events as JSON to the app.
- **Considered**: Reading Push's USB MIDI port directly in the browser via Web MIDI API (rejected — gives raw pad positions, not Live-processed musical pitches, and would require reimplementing Push's scale/transpose engine); a virtual MIDI port (IAC/loopMIDI) read by Web MIDI (rejected — routing MIDI out of the track redirects it away from the instrument, needing a second track; fiddlier and still pad-position-prone depending on routing).
- **Why**: Tapping inside Live yields the *actual musical notes* (Requirement: "notes as processed by Live"), doesn't interrupt audio, reuses skills already in progress, and opens a path to reading Live context (scale, clip) for v2.

## The seam (device ↔ app contract)
- **Choice**: Fixed local WebSocket on a known port (e.g. `ws://localhost:8080`); messages are small JSON objects `{ pitch, velocity }` (velocity 0 = note-off); app auto-reconnects on drop; app renders an idle state until notes arrive.
- **Why**: A stable, documented contract is what makes "hybrid from the start" real — either side can be packaged/auto-launched later without changing the protocol. Satisfies the always-on / auto-recover non-functional requirement.

## Frontend framework
- **Choice**: **TanStack Start + React** (TypeScript).
- **Considered**: Plain React + Vite (lighter, no SSR); vanilla JS single-file (the original prototype).
- **Why**: User preference, and it provides structure plus server functions for the v2 roadmap (saving progressions, playback views, possible accounts). For v1 the live MIDI path is pure client-side React; SSR/server-fns sit unused until v2 — accepted as deliberate headroom.

## Notation rendering
- **Choice**: **VexFlow** for v1.
- **Considered**: OpenSheetMusicDisplay (OSMD); hand-drawn staff.
- **Why**: v1 notation is a live, ever-changing stack of held notes on a grand staff with a chord symbol — no rhythm, no measures. That is VexFlow's native case and it re-renders fast. OSMD renders MusicXML *scores* and would require generating a MusicXML document per keypress and running full score layout — heavier and a poor fit for a real-time mirror. OSMD is built on VexFlow, so VexFlow is also the right foundation. **OSMD is the planned tool for v2 playback visualization** (a recorded clip genuinely is a score).

## Music theory / chord detection
- **Choice**: **tonal** (`Chord.detect`, plus `Note`/`Interval` helpers).
- **Considered**: The hand-rolled template matcher from the prototype.
- **Why**: Handles far more chords (extensions, alterations, inversions) than templates, and its note/interval helpers also drive piano key mapping and fretboard note placement — one library serves all four views. Replaces the prototype's limited detector.

## Piano / guitar / bass rendering
- **Choice**: **SVG via React** (declarative components driven by held-note state). Fretboard note positions computed from `tonal` against hardcoded standard tunings (6-string guitar EADGBE, 4-string bass EADG).
- **Considered**: Canvas (rejected for v1 — SVG is simpler to make declarative/reactive and these views are low-element-count); a fretboard library (none needed at this scope).
- **Why**: SVG maps cleanly to React state ("these notes are held → these cells are lit"), is easy to style, and is plenty performant for a keyboard and two necks. Standard tuning only per the v1 requirement.

## State management
- **Choice**: Local React state/hooks; held notes in a `useEffect`-scoped WebSocket client (client-only, never runs during SSR).
- **Why**: v1 has only transient in-memory state (the held-note set). No global store or persistence needed until v2.

## Hosting & deployment
- **Choice**: **Runs locally** for v1 — the app is served on `http://localhost` on the user's machine alongside Live. No cloud hosting.
- **Considered**: Deploying to Vercel/Netlify (unnecessary and would complicate the `ws://localhost` connection / mixed-content rules).
- **Why**: It's a local second-screen companion to Live; the data source is a local WebSocket. Local `http` avoids the https→ws mixed-content block. (Cloud hosting may matter only if v2 adds accounts/sync.)

## Packaging (hybrid delivery)
- **Choice for v1 build order**: **App standalone, device just sends notes** — build the clean seam now, defer the launcher. Auto-launch / single-installer packaging is the *final* milestone, not the first.
- **Considered**: M4L auto-launches the app (tightest); one installer bundles both.
- **Why**: Auto-launch/installer is packaging polish; doing it first would block the core views behind OS-specific launcher plumbing. Building the documented device↔app contract first keeps the product genuinely hybrid-ready while letting v1 focus on the four views. Wrap into one launchable product as the last step.

## Styling
- **Choice**: Plain CSS (or CSS modules); Tailwind optional if the user enabled it at scaffold.
- **Why**: The UI is a handful of views with no design system needs in v1; keep it light.

## CI/CD, storage, email, payments, analytics
- **Choice**: **None for v1.** No accounts, no persisted data, no third-party services beyond the libraries above.
- **Why**: v1 is a local, single-user, zero-data tool. These enter only if/when v2 adds saving, sync, or distribution at scale.
