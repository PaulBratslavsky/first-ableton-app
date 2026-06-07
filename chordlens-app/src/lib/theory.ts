// Key/scale awareness: estimate the key from what's being played, report its
// scale, whether it spells with flats, and the Roman numeral of a chord in it.

import { Key, Scale, Note, Progression } from 'tonal'

export type Mode = 'major' | 'minor'
export interface MusicalKey {
  tonic: number // pitch-class 0..11
  mode: Mode
}

// Krumhansl–Kessler key profiles (relative weights of each scale degree).
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

// Canonical key-tonic spellings (avoid double-sharps/flats, prefer common names).
const MAJOR_TONIC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_TONIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

function pearson(a: number[], b: number[]): number {
  const n = a.length
  const ma = a.reduce((s, x) => s + x, 0) / n
  const mb = b.reduce((s, x) => s + x, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma
    const xb = b[i] - mb
    num += xa * xb
    da += xa * xa
    db += xb * xb
  }
  const den = Math.sqrt(da * db)
  return den === 0 ? 0 : num / den
}

/**
 * Estimate the key from a pitch-class histogram (weights of each pc played).
 * Returns null for an empty histogram.
 */
export function estimateKey(histogram: number[]): MusicalKey | null {
  if (histogram.reduce((s, x) => s + x, 0) === 0) return null
  let best: MusicalKey | null = null
  let bestScore = -Infinity
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = Array.from({ length: 12 }, (_, i) => histogram[(tonic + i) % 12])
    const maj = pearson(rotated, KK_MAJOR)
    const min = pearson(rotated, KK_MINOR)
    if (maj > bestScore) {
      bestScore = maj
      best = { tonic, mode: 'major' }
    }
    if (min > bestScore) {
      bestScore = min
      best = { tonic, mode: 'minor' }
    }
  }
  return best
}

/** The key's tonic spelled as a note letter, e.g. {3,'major'} -> "Eb". */
export function tonicName(key: MusicalKey): string {
  return (key.mode === 'major' ? MAJOR_TONIC : MINOR_TONIC)[key.tonic]
}

/** Human-readable key name, e.g. "Eb major", "A minor". */
export function keyName(key: MusicalKey): string {
  return `${tonicName(key)} ${key.mode}`
}

/** Pitch-class (0..11) of the key's tonic, for highlighting the root. */
export function tonicPc(key: MusicalKey): number {
  return Note.chroma(tonicName(key)) ?? 0
}

/**
 * Convert Ableton's song key (root pitch-class + scale name) into a MusicalKey.
 * ChordLens only models major/minor, so any "…minor" scale → minor, else major.
 */
export function keyFromAbleton(rootPc: number, scaleName: string): MusicalKey {
  const tonic = ((Math.round(rootPc) % 12) + 12) % 12
  const mode: Mode = /min/i.test(scaleName) ? 'minor' : 'major'
  return { tonic, mode }
}

/** Does this key's signature use flats? (C major / A minor default to sharps.) */
export function usesFlats(key: MusicalKey): boolean {
  const name = tonicName(key)
  const alteration =
    key.mode === 'major'
      ? Key.majorKey(name).alteration
      : Key.minorKey(name).alteration
  return alteration < 0
}

/** Pitch-classes belonging to the key's (natural) scale. */
export function scalePcs(key: MusicalKey): Set<number> {
  const name = tonicName(key)
  const notes =
    key.mode === 'major'
      ? Key.majorKey(name).scale
      : Scale.get(`${name} minor`).notes
  const pcs = new Set<number>()
  for (const n of notes) {
    const c = Note.chroma(n)
    if (c != null) pcs.add(c)
  }
  return pcs
}

/**
 * Roman numeral of a chord within a key, e.g. ("G7", C major) -> "V7".
 * Slash chords are reduced to their upper triad. Returns null if it can't parse.
 */
export function romanNumeral(chordSymbol: string | null, key: MusicalKey): string | null {
  if (!chordSymbol) return null
  const base = chordSymbol.split('/')[0]
  try {
    const result = Progression.toRomanNumerals(tonicName(key), [base])
    const roman = result[0]
    return roman && roman !== '' && !roman.includes('undefined') ? roman : null
  } catch {
    return null
  }
}
