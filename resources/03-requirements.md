# Functional Requirements

> Scope principle for v1: **a passive, zero-UI real-time mirror with sensible defaults.** No settings, no key engine, standard tuning, sharps for all accidentals. The user plays on Push; the product shows four synchronized views and nothing else.

## Core features (MVP)

- The product must receive, in real time, the notes currently being played on Push (as processed by Live — i.e. the actual musical pitches, not raw pad positions).
- The product must track the set of currently-held notes (note-on adds, note-off removes) so that views always reflect exactly what is sounding now.
- The product must detect the chord formed by the held notes and identify a chord symbol (e.g. "Cmaj7", "Am", "G/B" for inversions) where one matches; single notes and unmatched sets are shown as note names.
- The product must render **four synchronized views** of the held notes, updating live:
  - **Piano keyboard view** — highlight the played keys across a multi-octave keyboard. *(Primary view — must be correct and polished; the others may be rougher in v1.)*
  - **Guitar fretboard view** — light up **every** position on a standard-tuned 6-string neck where a held note occurs. (No single-fingering selection or cycling in v1 — see Out of Scope.)
  - **Bass fretboard view** — same, for a standard-tuned 4-string bass neck.
  - **Notation view** — render held notes on a **grand staff** (treble + bass clef), with the detected **chord symbol** shown above. Accidentals default to **sharps** (no key-aware enharmonic spelling in v1).
- All four views must reflect the same held-note set at the same time (synchronized), with low enough latency to feel immediate while playing.
- The product must show a sensible idle/empty state when nothing is being played.

## Account & auth
- None. v1 is a local, single-user tool with no accounts, no sign-in, no user data.

## Data the product handles
- **Held notes**: the live set of currently-sounding MIDI pitches (transient, in-memory only).
- **Note/chord model**: derived note names and chord identification computed from the held notes.
- No persisted data in v1 (nothing saved between sessions).

## Integrations
- **Push playing input**: the product needs the stream of notes played on Push, as processed by Ableton Live. (How this stream is captured and transported is a Stage 4 tech decision; at the capability level, the requirement is simply "receive the live notes Live is producing.")

## Non-functional requirements
- **Latency**: updates must feel instant during live playing — fast enough that the visual keeps up with normal chord playing. (Target perceptual immediacy, not a hard ms figure yet.)
- **Always-on / passive**: runs as a second screen, requires no interaction during use, recovers on its own if the input connection drops and reconnects.
- **Correctness**: the piano view and chord/note identification must be musically accurate for common cases; fretboard "all positions" must be correct for standard tuning; notation must place pitches correctly on the grand staff.
- **Scale**: single user, single machine, local. No multi-user or networked scale concerns in v1.
- **Compliance**: none — no personal data collected or stored.

## Out of scope for MVP (parked)
- **Playback visualization** — visualizing a recorded clip/song synced to Live's transport. *(v2)*
- **Cycling / selecting guitar & bass fingerings** — choosing one playable shape or stepping through alternatives. v1 shows all note positions instead. *(v2 — this is the deferred half of the "all notes + cycle positions" choice, set aside to honor zero-UI.)*
- **Key / scale awareness and correct enharmonic spelling** (F♯ vs G♭). v1 defaults to sharps. *(v2)*
- **Alternate tunings** (drop D, 5-string bass, custom). v1 is standard tuning only. *(v2)*
- **Any settings/controls UI** (view toggles, handedness, octave convention). *(v2)*
- **Saving / exporting** progressions, voicings, or notation. *(v2)*
- **Left-handed guitar/bass layouts.** *(v2)*

## Open tension to confirm
- "Zero UI" vs. "cycle positions" conflict: drafted as **show all positions, no cycling** (zero UI wins). If you'd rather keep cycling as the single allowed control, we move it from Out-of-Scope back into Core and add one input.
