// ChordLens v1 static configuration — not user-editable (zero-UI MVP).
// All values are documented judgment calls from the build spec.

/**
 * Octave convention: Ableton's default is C3 = MIDI 60.
 * noteName(p) = NOTE_NAMES[p % 12] + (floor(p / 12) + OCTAVE_OFFSET).
 * floor(60/12) = 5, 5 + (-2) = 3  =>  "C3".
 * If your Live is set to C4 = 60, change this to -1 (labels only).
 */
export const OCTAVE_OFFSET = -2

/** Sharp spelling of each pitch-class (the default). */
export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const

/** Flat spelling, used when the detected key has a flat signature. */
export const FLAT_NAMES = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const

/** Standard 6-string guitar, low-to-high: E2 A2 D3 G3 B3 E4. */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64]

/** Standard 4-string bass, low-to-high: E1 A1 D2 G2. */
export const BASS_TUNING = [28, 33, 38, 43]

/** Frets drawn per neck (0 = open string). Enough for most voicings. */
export const FRET_COUNT = 15

/** Piano keyboard span: C2 (36) .. C6 (84), four octaves. */
export const PIANO_LOW = 36
export const PIANO_HIGH = 84

/** Notation clef split: pitch >= CLEF_SPLIT -> treble, otherwise bass (middle C). */
export const CLEF_SPLIT = 60
