// Framework-agnostic music helpers built on `tonal`.
// Pure functions, unit-testable, shared by every view (and future v2 server fns).

import { Chord } from 'tonal'
import { NOTE_NAMES, FLAT_NAMES, OCTAVE_OFFSET } from './config.ts'

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

/**
 * Positions of the held pitch-classes within a single fret window
 * [base, base+span] — a playable "shape in position" instead of every match
 * scattered across the neck.
 */
export function shapeWindowPositions(
  heldNotes: Set<number>,
  tuning: number[],
  fretCount: number,
  base: number,
  span: number,
): FretPosition[] {
  const heldPcs = new Set([...heldNotes].map(pitchClass))
  const lo = Math.max(0, base)
  const hi = Math.min(fretCount, base + span)
  const out: FretPosition[] = []
  for (let string = 0; string < tuning.length; string++) {
    for (let fret = lo; fret <= hi; fret++) {
      if (heldPcs.has(pitchClass(tuning[string] + fret))) out.push({ string, fret })
    }
  }
  return out
}

/**
 * Lowest window base whose [base, base+span] covers the most distinct held
 * pitch-classes — the "Auto" position (a complete, low voicing when possible).
 */
export function autoAnchor(
  heldNotes: Set<number>,
  tuning: number[],
  fretCount: number,
  span: number,
): number {
  const heldPcs = new Set([...heldNotes].map(pitchClass))
  if (heldPcs.size === 0) return 0
  let bestBase = 0
  let bestCount = -1
  const maxBase = Math.max(0, fretCount - span)
  for (let base = 0; base <= maxBase; base++) {
    const seen = new Set<number>()
    for (let string = 0; string < tuning.length; string++) {
      for (let fret = base; fret <= base + span; fret++) {
        const pc = pitchClass(tuning[string] + fret)
        if (heldPcs.has(pc)) seen.add(pc)
      }
    }
    if (seen.size > bestCount) {
      bestCount = seen.size
      bestBase = base
    }
    if (seen.size === heldPcs.size) break // earliest full-coverage = lowest box
  }
  return bestBase
}

/** Anchor (~F3) where a compact voicing's bass note lands on the grand staff. */
export const VOICING_BASE = 53

/**
 * Collapse a played chord (which may span several octaves with doubled notes)
 * into a compact close-position voicing: one note per pitch-class, stacked
 * ascending from the bass note, anchored near the staff center. Keeps a chord
 * legible in notation instead of scattering octave doublings/ledger lines.
 * Shared by NotationView and the progression sheet so they always match.
 */
export function compactVoicing(pitches: number[]): number[] {
  if (pitches.length === 0) return []
  const sorted = [...pitches].sort((a, b) => a - b)
  const bassPc = pitchClass(sorted[0])
  const present = new Set(sorted.map(pitchClass))
  const order = [bassPc]
  for (let i = 1; i < 12; i++) {
    const pc = (bassPc + i) % 12
    if (present.has(pc)) order.push(pc)
  }
  const out: number[] = []
  let prev = VOICING_BASE + ((((bassPc - VOICING_BASE) % 12) + 12) % 12)
  out.push(prev)
  for (let k = 1; k < order.length; k++) {
    let m = prev + ((((order[k] - prev) % 12) + 12) % 12)
    if (m <= prev) m += 12
    out.push(m)
    prev = m
  }
  return out
}

/**
 * Keep one position per pitch-class — the lowest (by fret, then string) — so a
 * note that's playable several ways in a box shows a single dot.
 */
export function onePerPitchClass(
  positions: FretPosition[],
  tuning: number[],
): FretPosition[] {
  const byPc = new Map<number, FretPosition>()
  for (const p of positions) {
    const pc = pitchClass(tuning[p.string] + p.fret)
    const cur = byPc.get(pc)
    if (
      !cur ||
      p.fret < cur.fret ||
      (p.fret === cur.fret && p.string < cur.string)
    ) {
      byPc.set(pc, p)
    }
  }
  return [...byPc.values()]
}
