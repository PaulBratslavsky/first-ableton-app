// Guitar chord-shape search: turn a chord symbol into ranked, playable
// fingerings. Pure and framework-agnostic, like the rest of lib/.
//
// The fretboard's default view answers "where do these notes live?" — it lights
// every position matching a held pitch-class. This module answers the guitarist's
// question instead: "what do I actually grab?" It searches real fingerings
// (a fret or a mute per string), throws out the ones a hand can't play, and
// ranks what's left easiest-first.

import { Chord, Note } from 'tonal'
import { pitchClass } from './music'

/** Frets a hand can cover without shifting position. */
const SPAN = 4
/** A chord needs some body — two strings is a dyad, not a shape. */
const MIN_SOUNDING = 3
/** Four fingers, with a barre counting as one. */
const MAX_FINGERS = 4
/** Muted strings *between* sounding ones are awkward; a couple is the ceiling. */
const MAX_INNER_MUTES = 2
/**
 * Adjacent strings further apart than this leave an audible hole. Standard
 * tuning is fourths, so ordinary shapes routinely span a fifth or a sixth
 * between neighbours — the open G chord puts a minor sixth between the B and
 * high E strings. Only a genuine skip is wider than this.
 */
const MAX_COMFORTABLE_GAP = 8
const DEFAULT_LIMIT = 8

// Scoring weights. Roughly calibrated in "fingers": a barre costs about what an
// extra finger and a half does, and climbing the neck gets expensive fast —
// guitarists reach for the lowest grip that works.
const COST_PER_FRET_UP_THE_NECK = 0.35
const COST_BARRE = 1.5
const COST_MUTED_STRING = 1.5
const COST_INNER_MUTE = 2
const COST_DROPPED_FIFTH = 1.5
/**
 * Playing a chord tone other than the root in the bass. Steep on purpose: an
 * inversion is a different chord to the ear, so it has to beat the named shape
 * by a wide margin before it's what you meant.
 */
const COST_INVERSION = 4
/**
 * Two adjacent strings sounding the same pitch. Search artifact, not a voicing:
 * the second string adds nothing and costs a finger.
 */
const COST_UNISON = 1.5
/**
 * A higher string sounding *below* the one beneath it. Guitar voicings run low
 * to high across the neck; a crossing is the search finding a technicality.
 */
const COST_VOICE_CROSSING = 2
/** Two fingers pinned to one fret on strings a barre can't reach across. */
const COST_CRAMPED_FRET = 1.5
/** Charged per fret of reach beyond a relaxed two-fret grip. */
const COST_PER_STRETCHED_FRET = 0.5
const BONUS_OPEN_STRING = 0.5

/** Sentinel for a string that isn't played. */
export const MUTED = -1

export interface Voicing {
  /** Fret per string, low-to-high. MUTED (-1) = not played, 0 = open. */
  frets: number[]
  /** Lowest fretted fret — where the hand sits. 0 for an all-open shape. */
  position: number
  /** Index barre at `position`, spanning strings `from`..`to` inclusive. */
  barre: { fret: number; from: number; to: number } | null
  /** Fingers needed, counting a barre as one. */
  fingers: number
  /** Lower is easier to play. Shapes come back sorted ascending. */
  score: number
}

interface ChordSpec {
  /** Every pitch-class in the chord. */
  pcs: number[]
  rootPc: number
  /** Required in the bass. The root unless the symbol names a slash bass. */
  bassPc: number
  /** True when the bass came from a slash — then it's non-negotiable. */
  bassIsExplicit: boolean
  /** The fifth, droppable on chords rich enough to spare it. */
  omittablePc: number | null
}

/**
 * Expand a chord symbol into the pitch-classes a voicing has to cover.
 * Handles slash chords itself rather than leaning on tonal, so the named bass
 * survives as a hard constraint.
 */
function parseChord(symbol: string): ChordSpec | null {
  if (!symbol) return null

  const [body, slashBass] = symbol.split('/')
  const chord = Chord.get(body)
  if (chord.empty || chord.notes.length < 2 || !chord.tonic) return null

  const pcs: number[] = []
  for (const note of chord.notes) {
    const chroma = Note.chroma(note)
    if (chroma == null) return null
    if (!pcs.includes(chroma)) pcs.push(chroma)
  }

  const rootPc = Note.chroma(chord.tonic)
  if (rootPc == null) return null

  let bassPc = rootPc
  let bassIsExplicit = false
  if (slashBass) {
    const chroma = Note.chroma(slashBass)
    if (chroma == null) return null
    bassPc = chroma
    bassIsExplicit = true
  }

  // The fifth is the first thing a guitarist drops when strings run out, but
  // only on a chord that still says what it is without one.
  let omittablePc: number | null = null
  if (chord.notes.length >= 4) {
    const fifthAt = chord.intervals.indexOf('5P')
    if (fifthAt >= 0) {
      const chroma = Note.chroma(chord.notes[fifthAt])
      if (chroma != null && chroma !== rootPc && chroma !== bassPc) {
        omittablePc = chroma
      }
    }
  }

  return { pcs, rootPc, bassPc, bassIsExplicit, omittablePc }
}

/**
 * Frets on one string that sound a chord tone, restricted to a hand position:
 * the open string (always reachable) plus anything in [base, base+SPAN].
 */
function candidateFrets(
  open: number,
  chordPcs: Set<number>,
  fretCount: number,
  base: number,
): number[] {
  const frets: number[] = []
  if (chordPcs.has(pitchClass(open))) frets.push(0)
  const lo = Math.max(1, base)
  const hi = Math.min(fretCount, base + SPAN)
  for (let fret = lo; fret <= hi; fret++) {
    if (chordPcs.has(pitchClass(open + fret))) frets.push(fret)
  }
  return frets
}

/**
 * An index barre covers every string from the first to the last occurrence of
 * the lowest fretted fret. It's only real if nothing between those endpoints
 * sounds *below* the barre — an open string in the middle would be stopped by
 * the finger, so that shape isn't barred, it's impossible.
 */
function findBarre(frets: number[]): Voicing['barre'] {
  const fretted = frets.filter((f) => f > 0)
  if (fretted.length < 2) return null

  const fret = Math.min(...fretted)
  const at = frets.reduce<number[]>((acc, f, s) => (f === fret ? [...acc, s] : acc), [])
  if (at.length < 2) return null

  const from = at[0]
  const to = at[at.length - 1]
  for (let s = from; s <= to; s++) {
    if (frets[s] === MUTED) continue
    if (frets[s] < fret) return null
  }
  return { fret, from, to }
}

/** Evaluate a candidate shape. Returns null when a hand couldn't play it. */
function evaluate(
  frets: number[],
  tuning: number[],
  spec: ChordSpec,
): Voicing | null {
  const soundingStrings: number[] = []
  for (let s = 0; s < frets.length; s++) {
    if (frets[s] !== MUTED) soundingStrings.push(s)
  }
  if (soundingStrings.length < MIN_SOUNDING) return null

  // The bass note decides what the chord is called. A slash bass is mandatory;
  // otherwise an inversion is allowed but pays for itself in the score.
  const lowest = soundingStrings[0]
  const bassPc = pitchClass(tuning[lowest] + frets[lowest])
  if (spec.bassIsExplicit && bassPc !== spec.bassPc) return null
  if (!spec.bassIsExplicit && bassPc !== spec.rootPc && spec.omittablePc === bassPc) {
    return null // never invert onto a note we'd otherwise be free to drop
  }

  // Coverage: every chord tone present, give or take a droppable fifth.
  const sounded = new Set(
    soundingStrings.map((s) => pitchClass(tuning[s] + frets[s])),
  )
  let droppedFifth = false
  for (const pc of spec.pcs) {
    if (sounded.has(pc)) continue
    if (pc === spec.omittablePc && !droppedFifth) {
      droppedFifth = true
      continue
    }
    return null
  }

  // Mutes between sounding strings mean skipping a string mid-strum.
  const innerMutes = frets
    .slice(soundingStrings[0], soundingStrings[soundingStrings.length - 1])
    .filter((f) => f === MUTED).length
  if (innerMutes > MAX_INNER_MUTES) return null

  // A guitarist barres when it's easier, not merely when it's possible: the
  // open D shape *could* be barred at the 2nd fret, but three fingers is less
  // work. Cost it both ways and keep the cheaper hand.
  const frettedStrings = frets.filter((f) => f > 0)
  const candidateBarre = findBarre(frets)
  const barreFingers = candidateBarre
    ? 1 + frettedStrings.filter((f) => f > candidateBarre.fret).length
    : Infinity
  const plainFingers = frettedStrings.length
  const barreIsWorthIt =
    candidateBarre != null &&
    (plainFingers > MAX_FINGERS || barreFingers + COST_BARRE < plainFingers)

  const barre = barreIsWorthIt ? candidateBarre : null
  const fingers = barreIsWorthIt ? barreFingers : plainFingers
  if (fingers > MAX_FINGERS) return null

  const position = frettedStrings.length ? Math.min(...frettedStrings) : 0
  const stretch = frettedStrings.length
    ? Math.max(...frettedStrings) - position
    : 0

  // Two fingers landing on the same fret across strings they can't be barred
  // across — something lower sits between them — is a cramped, unnatural grip.
  const doubledFret =
    candidateBarre == null && frettedStrings.filter((f) => f === position).length > 1
  const openCount = soundingStrings.filter((s) => frets[s] === 0).length
  const muteCount = frets.length - soundingStrings.length

  // Spacing between adjacent sounding strings: too wide leaves a hole you can
  // hear, and zero means the same pitch twice for no gain.
  let spacingPenalty = 0
  for (let i = 1; i < soundingStrings.length; i++) {
    const prev = tuning[soundingStrings[i - 1]] + frets[soundingStrings[i - 1]]
    const next = tuning[soundingStrings[i]] + frets[soundingStrings[i]]
    if (next === prev) spacingPenalty += COST_UNISON
    else if (next < prev) spacingPenalty += COST_VOICE_CROSSING
    else if (next - prev > MAX_COMFORTABLE_GAP) {
      spacingPenalty += (next - prev - MAX_COMFORTABLE_GAP) * 0.7
    }
  }

  const score =
    fingers +
    position * COST_PER_FRET_UP_THE_NECK +
    (barre ? COST_BARRE : 0) +
    muteCount * COST_MUTED_STRING +
    innerMutes * COST_INNER_MUTE -
    openCount * BONUS_OPEN_STRING +
    (bassPc === spec.rootPc || spec.bassIsExplicit ? 0 : COST_INVERSION) +
    (droppedFifth ? COST_DROPPED_FIFTH : 0) +
    (doubledFret ? COST_CRAMPED_FRET : 0) +
    Math.max(0, stretch - 2) * COST_PER_STRETCHED_FRET +
    spacingPenalty

  return { frets, position, barre, fingers, score }
}

/** Stable identity for a shape, so the same grip found at two anchors dedupes. */
const shapeKey = (frets: number[]) => frets.join(',')

const cache = new Map<string, Voicing[]>()

/**
 * Playable fingerings for `symbol` on `tuning`, easiest first.
 *
 * Searches each hand position on the neck independently — for every anchor
 * fret, every combination of chord tones (or a mute) reachable without
 * shifting — then filters to what a hand can actually hold and ranks the
 * survivors. Returns [] for a symbol tonal can't parse.
 *
 * Results are cached per (symbol, tuning, fretCount): the search is a few
 * hundred thousand cheap combinations, which is nothing once per chord change
 * but too much to repeat on every MIDI event.
 */
export function voicingsFor(
  symbol: string,
  tuning: number[],
  fretCount: number,
  limit: number = DEFAULT_LIMIT,
): Voicing[] {
  const cacheKey = `${symbol}|${tuning.join(',')}|${fretCount}`
  const cached = cache.get(cacheKey)
  if (cached) return cached.slice(0, limit)

  const spec = parseChord(symbol)
  if (!spec) {
    cache.set(cacheKey, [])
    return []
  }

  const chordPcs = new Set(spec.pcs)
  const strings = tuning.length
  const maxMutes = strings - MIN_SOUNDING
  const found = new Map<string, Voicing>()

  const maxBase = Math.max(0, fretCount - SPAN)
  for (let base = 0; base <= maxBase; base++) {
    const perString = tuning.map((open) =>
      candidateFrets(open, chordPcs, fretCount, base),
    )

    const frets = new Array<number>(strings)
    const walk = (string: number, mutes: number) => {
      if (mutes > maxMutes) return
      if (string === strings) {
        const voicing = evaluate([...frets], tuning, spec)
        if (voicing) {
          const key = shapeKey(voicing.frets)
          const prev = found.get(key)
          if (!prev || voicing.score < prev.score) found.set(key, voicing)
        }
        return
      }
      frets[string] = MUTED
      walk(string + 1, mutes + 1)
      for (const fret of perString[string]) {
        frets[string] = fret
        walk(string + 1, mutes)
      }
    }
    walk(0, 0)
  }

  const ranked = [...found.values()].sort((a, b) => a.score - b.score)
  cache.set(cacheKey, ranked)
  return ranked.slice(0, limit)
}
