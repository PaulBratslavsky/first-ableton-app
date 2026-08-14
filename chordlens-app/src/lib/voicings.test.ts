import { describe, it, expect } from 'vitest'
import { voicingsFor, type Voicing } from './voicings'
import { pitchClass } from './music'
import { GUITAR_TUNING, FRET_COUNT } from './config'

/**
 * Render a voicing in chord-chart shorthand: "xx0232", "133211".
 * Frets above 9 use base-36 digits (10 -> "a") so a shape stays one char
 * per string and the assertions read like a chord book.
 */
const chart = (v: Voicing) =>
  v.frets.map((f) => (f < 0 ? 'x' : f.toString(36))).join('')

const guitar = (symbol: string) =>
  voicingsFor(symbol, GUITAR_TUNING, FRET_COUNT)

const charts = (symbol: string) => guitar(symbol).map(chart)

describe('voicingsFor — the shapes guitarists actually play', () => {
  // Unambiguous open chords: the canonical grip must come out on top.
  it.each([
    ['C', 'x32010'],
    ['D', 'xx0232'],
    ['Am', 'x02210'],
    ['Em', '022000'],
    ['E', '022100'],
    ['A', 'x02220'],
    ['G7', '320001'],
  ])('ranks %s as %s', (symbol, expected) => {
    expect(chart(guitar(symbol)[0])).toBe(expected)
  })

  // Barre chords have a legitimately easier partial grip that may outrank the
  // full shape (xx3211 vs 133211). Require the canonical shape to be offered,
  // not to win.
  it.each([
    ['F', '133211'],
    ['Bm', 'x24432'],
    ['F#m', '244222'],
    ['Bb', 'x13331'],
  ])('offers the full barre shape %s -> %s', (symbol, expected) => {
    expect(charts(symbol)).toContain(expected)
  })
})

describe('voicingsFor — playability invariants', () => {
  const symbols = ['C', 'D', 'Am', 'F', 'Bm', 'G7', 'Cmaj7', 'Ddim', 'Eaug', 'A7sus4']

  it('never asks for more than four fingers', () => {
    for (const s of symbols) {
      for (const v of guitar(s)) expect(v.fingers).toBeLessThanOrEqual(4)
    }
  })

  it('never spans more than four frets with the fretting hand', () => {
    for (const s of symbols) {
      for (const v of guitar(s)) {
        const fretted = v.frets.filter((f) => f > 0)
        if (fretted.length < 2) continue
        expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4)
      }
    }
  })

  it('sounds at least three strings', () => {
    for (const s of symbols) {
      for (const v of guitar(s)) {
        expect(v.frets.filter((f) => f >= 0).length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('only sounds notes that belong to the chord', () => {
    // C major = C E G
    const chordPcs = new Set([0, 4, 7])
    for (const v of guitar('C')) {
      v.frets.forEach((f, s) => {
        if (f < 0) return
        expect(chordPcs.has(pitchClass(GUITAR_TUNING[s] + f))).toBe(true)
      })
    }
  })

  it('puts the root in the bass on the top-ranked shape', () => {
    // D major -> root D (pc 2) on the lowest sounding string.
    const best = guitar('D')[0]
    const lowest = best.frets.findIndex((f) => f >= 0)
    expect(pitchClass(GUITAR_TUNING[lowest] + best.frets[lowest])).toBe(2)
  })

  it('honours the named bass of a slash chord', () => {
    // G/B -> B (pc 11) in the bass on every shape offered.
    const shapes = guitar('G/B')
    expect(shapes.length).toBeGreaterThan(0)
    for (const v of shapes) {
      const lowest = v.frets.findIndex((f) => f >= 0)
      expect(pitchClass(GUITAR_TUNING[lowest] + v.frets[lowest])).toBe(11)
    }
  })

  it('walks up the neck rather than shuffling one hand position', () => {
    const positions = guitar('C').map((v) => (v.frets.includes(0) ? 0 : v.position))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    // Every entry is a distinct hand position — no eight ways to fret open C.
    expect(new Set(positions).size).toBe(positions.length)
  })

  it('offers grips well up the neck, not just at the nut', () => {
    // The whole point: something to play along with wherever your hand is.
    for (const symbol of ['C', 'G', 'Am', 'F', 'D']) {
      const positions = guitar(symbol).map((v) => v.position)
      expect(Math.max(...positions)).toBeGreaterThanOrEqual(5)
    }
  })

  it('leads with a shape at or near the nut', () => {
    expect(guitar('C')[0].frets).toEqual([-1, 3, 2, 0, 1, 0])
    expect(guitar('G')[0].frets).toEqual([3, 2, 0, 0, 0, 3])
  })

  it('returns distinct shapes', () => {
    const c = charts('C')
    expect(new Set(c).size).toBe(c.length)
  })
})

describe('voicingsFor — barre detection', () => {
  it('reports the index barre on F', () => {
    const f = guitar('F').find((v) => chart(v) === '133211')!
    expect(f.barre).toEqual({ fret: 1, from: 0, to: 5 })
    expect(f.fingers).toBe(4)
  })

  it('reports no barre on an open chord', () => {
    expect(guitar('C')[0].barre).toBeNull()
  })

  it('does not call it a barre when a lower open string sits inside the span', () => {
    // Any shape with an open string between the barre candidate's endpoints
    // can't be barred — the finger would stop that string.
    for (const v of guitar('Bm')) {
      if (!v.barre) continue
      for (let s = v.barre.from; s <= v.barre.to; s++) {
        if (v.frets[s] < 0) continue
        expect(v.frets[s]).toBeGreaterThanOrEqual(v.barre.fret)
      }
    }
  })
})

describe('voicingsFor — edge cases', () => {
  it('returns nothing for an empty symbol', () => {
    expect(voicingsFor('', GUITAR_TUNING, FRET_COUNT)).toEqual([])
  })

  it('returns nothing for an unparseable symbol', () => {
    expect(voicingsFor('not-a-chord', GUITAR_TUNING, FRET_COUNT)).toEqual([])
  })

  it('respects the limit', () => {
    expect(voicingsFor('C', GUITAR_TUNING, FRET_COUNT, 3)).toHaveLength(3)
  })

  it('stays within the fret count', () => {
    for (const v of voicingsFor('C', GUITAR_TUNING, 5)) {
      for (const f of v.frets) expect(f).toBeLessThanOrEqual(5)
    }
  })
})
