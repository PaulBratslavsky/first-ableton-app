import { describe, it, expect } from 'vitest'
import { detectChord, noteName, pitchClass, fretPositionsFor } from './music'
import { GUITAR_TUNING, BASS_TUNING, FRET_COUNT } from './config'

describe('pitchClass', () => {
  it('maps MIDI pitches to 0..11', () => {
    expect(pitchClass(60)).toBe(0) // C
    expect(pitchClass(61)).toBe(1) // C#
    expect(pitchClass(72)).toBe(0) // C an octave up
    expect(pitchClass(59)).toBe(11) // B
  })
})

describe('noteName', () => {
  it('uses sharps and the Ableton C3=60 convention', () => {
    expect(noteName(60)).toBe('C3')
    expect(noteName(61)).toBe('C#3')
    expect(noteName(72)).toBe('C4')
    expect(noteName(64)).toBe('E3')
  })
})

describe('detectChord', () => {
  it('returns null for an empty set', () => {
    expect(detectChord([])).toBeNull()
  })

  it('detects a major triad and drops the major-quality M', () => {
    const c = detectChord([60, 64, 67])!
    expect(c.chordSymbol).toBe('C')
    expect(c.noteNames).toEqual(['C3', 'E3', 'G3'])
    expect(c.bassPc).toBe(0)
  })

  it('detects a minor triad', () => {
    expect(detectChord([57, 60, 64])!.chordSymbol).toBe('Am')
  })

  it('detects a major seventh', () => {
    expect(detectChord([60, 64, 67, 71])!.chordSymbol).toBe('Cmaj7')
  })

  it('detects a slash chord from an inversion', () => {
    // G major with B in the bass: B D G
    expect(detectChord([59, 62, 67])!.chordSymbol).toBe('G/B')
  })

  it('reports a null symbol for a single note', () => {
    const c = detectChord([60])!
    expect(c.chordSymbol).toBeNull()
    expect(c.noteNames).toEqual(['C3'])
  })

  it('sorts pitches and computes bass pitch-class regardless of input order', () => {
    const c = detectChord([67, 60, 64])!
    expect(c.pitches).toEqual([60, 64, 67])
    expect(c.bassPc).toBe(0)
  })
})

describe('fretPositionsFor', () => {
  it('lights an open low-E on the guitar for a held E', () => {
    const positions = fretPositionsFor(new Set([40]), GUITAR_TUNING, FRET_COUNT)
    expect(positions).toContainEqual({ string: 0, fret: 0 })
    // every position must actually be an E (pitch-class 4)
    for (const p of positions) {
      expect(pitchClass(GUITAR_TUNING[p.string] + p.fret)).toBe(4)
    }
  })

  it('matches by pitch-class across octaves', () => {
    // a single held C should light the 8th fret of the low-E string (E2+8 = C3)
    const positions = fretPositionsFor(new Set([60]), GUITAR_TUNING, FRET_COUNT)
    expect(positions).toContainEqual({ string: 0, fret: 8 })
  })

  it('returns nothing for an empty held set', () => {
    expect(fretPositionsFor(new Set(), BASS_TUNING, FRET_COUNT)).toEqual([])
  })
})
