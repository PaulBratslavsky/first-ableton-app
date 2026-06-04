import { describe, it, expect } from 'vitest'
import {
  estimateKey,
  keyName,
  tonicName,
  usesFlats,
  scalePcs,
  romanNumeral,
  type MusicalKey,
} from './theory'

/** Build a histogram from a list of pitch-classes. */
function hist(pcs: number[]): number[] {
  const h = new Array(12).fill(0)
  for (const pc of pcs) h[pc] += 1
  return h
}

describe('estimateKey', () => {
  it('returns null for silence', () => {
    expect(estimateKey(new Array(12).fill(0))).toBeNull()
  })

  it('detects C major from its scale', () => {
    const k = estimateKey(hist([0, 2, 4, 5, 7, 9, 11]))!
    expect(k).toEqual({ tonic: 0, mode: 'major' })
  })

  it('detects A minor from its scale', () => {
    // Weight the tonic triad so it leans minor rather than its C-major relative.
    const k = estimateKey(hist([9, 9, 0, 4, 9, 11, 2, 5, 7]))!
    expect(k.tonic).toBe(9)
    expect(k.mode).toBe('minor')
  })

  it('detects G major from its scale', () => {
    const k = estimateKey(hist([7, 9, 11, 0, 2, 4, 6]))!
    expect(k).toEqual({ tonic: 7, mode: 'major' })
  })
})

describe('key naming + spelling', () => {
  it('names keys', () => {
    expect(keyName({ tonic: 0, mode: 'major' })).toBe('C major')
    expect(keyName({ tonic: 9, mode: 'minor' })).toBe('A minor')
    expect(tonicName({ tonic: 3, mode: 'major' })).toBe('Eb')
  })

  it('flags flat keys', () => {
    expect(usesFlats({ tonic: 5, mode: 'major' })).toBe(true) // F major
    expect(usesFlats({ tonic: 3, mode: 'major' })).toBe(true) // Eb major
    expect(usesFlats({ tonic: 0, mode: 'major' })).toBe(false) // C major
    expect(usesFlats({ tonic: 7, mode: 'major' })).toBe(false) // G major
    expect(usesFlats({ tonic: 0, mode: 'minor' })).toBe(true) // C minor (3 flats)
    expect(usesFlats({ tonic: 9, mode: 'minor' })).toBe(false) // A minor
  })
})

describe('scalePcs', () => {
  it('returns the 7 pitch-classes of C major', () => {
    const pcs = scalePcs({ tonic: 0, mode: 'major' })
    expect([...pcs].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11])
  })

  it('returns the 7 pitch-classes of A minor', () => {
    const pcs = scalePcs({ tonic: 9, mode: 'minor' })
    expect([...pcs].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11])
  })
})

describe('romanNumeral', () => {
  const C: MusicalKey = { tonic: 0, mode: 'major' }
  it('analyzes diatonic chords in C major', () => {
    expect(romanNumeral('G7', C)).toBe('V7')
    expect(romanNumeral('Dm7', C)).toBe('IIm7')
    expect(romanNumeral('C', C)).toBe('I')
  })
  it('reduces slash chords to the upper triad', () => {
    expect(romanNumeral('G/B', C)).toBe('V')
  })
  it('returns null for no chord', () => {
    expect(romanNumeral(null, C)).toBeNull()
  })
})
