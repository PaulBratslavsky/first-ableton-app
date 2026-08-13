import { describe, it, expect } from 'vitest'
import { applyNote, heldFor, UNTRACKED } from './ableton'

const empty = new Map<number, Set<number>>()

/** Play a run of note events through the reducer. */
const play = (...notes: Array<[number, number, number | null | undefined]>) =>
  notes.reduce(
    (acc, [pitch, velocity, track]) => applyNote(acc, { pitch, velocity, track }),
    empty as ReadonlyMap<number, Set<number>>,
  )

describe('applyNote', () => {
  it("keeps each track's notes apart", () => {
    const held = play([60, 100, 0], [64, 100, 0], [40, 100, 3])
    expect([...(held.get(0) ?? [])]).toEqual([60, 64])
    expect([...(held.get(3) ?? [])]).toEqual([40])
  })

  it('releases on velocity 0, from the right track only', () => {
    // The same pitch on two tracks: releasing one must not silence the other.
    const held = applyNote(play([60, 100, 0], [60, 100, 3]), {
      pitch: 60,
      velocity: 0,
      track: 0,
    })
    expect(held.has(0)).toBe(false)
    expect([...(held.get(3) ?? [])]).toEqual([60])
  })

  it('forgets a track once nothing is sounding on it', () => {
    // Empty sets would make "which tracks are playing" a lie.
    const held = applyNote(play([60, 100, 2]), { pitch: 60, velocity: 0, track: 2 })
    expect(held.size).toBe(0)
  })

  it('files notes from a device with no track under UNTRACKED', () => {
    expect([...(play([60, 100, null]).get(UNTRACKED) ?? [])]).toEqual([60])
    expect([...(play([62, 100, undefined]).get(UNTRACKED) ?? [])]).toEqual([62])
  })

  it('does not mutate the map it was given', () => {
    const before = play([60, 100, 0])
    const after = applyNote(before, { pitch: 64, velocity: 100, track: 0 })
    expect([...(before.get(0) ?? [])]).toEqual([60])
    expect([...(after.get(0) ?? [])]).toEqual([60, 64])
  })
})

describe('heldFor', () => {
  const twoTracks = play([60, 100, 0], [64, 100, 0], [40, 100, 3], [47, 100, 3])

  it('follows one track when asked', () => {
    expect([...heldFor(twoTracks, 0)].sort((a, b) => a - b)).toEqual([60, 64])
    expect([...heldFor(twoTracks, 3)].sort((a, b) => a - b)).toEqual([40, 47])
  })

  it('folds every track together when no track is chosen', () => {
    expect([...heldFor(twoTracks, null)].sort((a, b) => a - b)).toEqual([40, 47, 60, 64])
  })

  it('collapses a pitch played on two tracks at once', () => {
    const unison = play([60, 100, 0], [60, 100, 1])
    expect([...heldFor(unison, null)]).toEqual([60])
  })

  it('is empty for a track that is not playing', () => {
    expect(heldFor(twoTracks, 9).size).toBe(0)
    expect(heldFor(empty, null).size).toBe(0)
  })

  it('hands back a copy, so callers cannot corrupt the store', () => {
    const one = heldFor(twoTracks, 0)
    one.add(99)
    expect(heldFor(twoTracks, 0).has(99)).toBe(false)
  })
})
