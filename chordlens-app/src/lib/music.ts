// Framework-agnostic music helpers built on `tonal`.
// Pure functions, unit-testable, shared by every view (and future v2 server fns).

import { Chord } from 'tonal'
import { NOTE_NAMES, FLAT_NAMES, OCTAVE_OFFSET } from './config'

/** MIDI pitch -> pitch class 0..11 (C=0). Safe for any integer. */
export function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12
}

/** MIDI pitch -> note name with octave, e.g. 60 -> "C3". Sharps unless useFlats. */
export function noteName(pitch: number, useFlats = false): string {
  const octave = Math.floor(pitch / 12) + OCTAVE_OFFSET
  return (useFlats ? FLAT_NAMES : NOTE_NAMES)[pitchClass(pitch)] + octave
}

export interface DerivedChord {
  /** Sorted held MIDI pitches (low to high). */
  pitches: number[]
  /** Sharp-spelled note names, e.g. ["C3","E3","G3"]. */
  noteNames: string[]
  /** Detected chord symbol, or null when nothing matches. */
  chordSymbol: string | null
  /** Pitch-class of the lowest held note (drives slash-chord display). */
  bassPc: number
}

/**
 * Normalize tonal's symbol toward the spec's house style:
 * a plain major triad comes back as "CM" / "GM/B"; drop the major-quality "M"
 * so it reads "C" / "G/B". Leaves "maj7" (lowercase) and minor "m" untouched.
 */
function normalizeSymbol(symbol: string): string {
  return symbol.replace(/M(?=\/|$)/, '')
}

/**
 * `Chord.detect` can rank an obscure altered/augmented re-spelling ahead of the
 * common reading (e.g. it lists "Bm#5" before "GM/B" for B-D-G). Penalize those
 * re-spellings so the everyday chord wins — this is the "best match" the spec
 * asks for, not merely tonal's first match.
 */
function commonnessPenalty(symbol: string): number {
  let penalty = 0
  if (/#5|b5|#9|b9|#11|b13|alt/.test(symbol)) penalty += 2
  if (/dim|aug|\+|°/.test(symbol)) penalty += 2
  return penalty
}

function bestSymbol(candidates: string[]): string | null {
  if (candidates.length === 0) return null
  // Stable sort by penalty: ties keep tonal's original ordering.
  let best = candidates[0]
  let bestPenalty = commonnessPenalty(best)
  for (let i = 1; i < candidates.length; i++) {
    const penalty = commonnessPenalty(candidates[i])
    if (penalty < bestPenalty) {
      best = candidates[i]
      bestPenalty = penalty
    }
  }
  return normalizeSymbol(best)
}

/**
 * Detect the chord formed by a set of held MIDI pitches.
 * Returns null for the empty set. Single notes / unmatched sets yield a null
 * chordSymbol (callers fall back to showing note names).
 */
export function detectChord(pitches: number[], useFlats = false): DerivedChord | null {
  if (pitches.length === 0) return null

  const sorted = [...pitches].sort((a, b) => a - b)
  const noteNames = sorted.map((p) => noteName(p, useFlats))

  // Feed sharp-spelled names (lowest first) so tonal respects the bass note
  // and produces sharp-spelled, inversion-aware symbols like "GM/B".
  const candidates = Chord.detect(noteNames)
  const chordSymbol = bestSymbol(candidates)

  return {
    pitches: sorted,
    noteNames,
    chordSymbol,
    bassPc: pitchClass(sorted[0]),
  }
}

export interface FretPosition {
  /** String index, 0 = lowest-pitched string. */
  string: number
  /** Fret number, 0 = open string. */
  fret: number
}

/**
 * Every position on the neck whose resulting pitch-class matches a held note's
 * pitch-class — v1 lights ALL positions (no single-fingering, no cycling).
 */
export function fretPositionsFor(
  heldNotes: Set<number>,
  tuning: number[],
  fretCount: number,
): FretPosition[] {
  const heldPcs = new Set([...heldNotes].map(pitchClass))
  const positions: FretPosition[] = []
  for (let string = 0; string < tuning.length; string++) {
    for (let fret = 0; fret <= fretCount; fret++) {
      if (heldPcs.has(pitchClass(tuning[string] + fret))) {
        positions.push({ string, fret })
      }
    }
  }
  return positions
}
