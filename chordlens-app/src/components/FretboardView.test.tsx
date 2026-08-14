// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FretboardView } from './FretboardView'
import { GUITAR_TUNING, BASS_TUNING, FRET_COUNT } from '../lib/config'

afterEach(cleanup)

// Mirrors the geometry constants in FretboardView.
const PAD_Y = 22
const STRING_GAP = 26
const LABEL_W = 30
const OPEN_W = 30
const FRET_W = 40
const NUT_X = LABEL_W + OPEN_W

/** Every fret a dot sits on, as "string:fret", so shapes can be identified. */
function dotsOn(container: HTMLElement) {
  return [...container.querySelectorAll('circle.fb-note')].map((dot) => {
    const cy = Number(dot.getAttribute('cy'))
    const cx = Number(dot.getAttribute('cx'))
    const string = 5 - Math.round((cy - PAD_Y) / STRING_GAP)
    const fret = cx < NUT_X ? 0 : Math.round((cx - NUT_X) / FRET_W + 0.5)
    return `${string}:${fret}`
  })
}

function guitar(chordSymbol: string | null) {
  const { container } = render(
    <FretboardView
      label="Guitar"
      tuning={GUITAR_TUNING}
      fretCount={FRET_COUNT}
      heldNotes={new Set()}
      chordSymbol={chordSymbol}
    />,
  )
  return container
}

const turnOnChordMode = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Chord' }))
const positionLabel = (c: HTMLElement) =>
  c.querySelector('.fb-pos-label')!.textContent
const boxes = (c: HTMLElement) => c.querySelectorAll('rect.fb-shape-box')

describe('FretboardView chord mode', () => {
  it('shows three shapes at once, each in its own box', () => {
    const container = guitar('C')
    turnOnChordMode()

    expect(boxes(container)).toHaveLength(3)
    expect(positionLabel(container)).toBe('open · fr 3 · fr 8')

    // Open C, the A-shape barre at 3, and the E-shape barre at 8 — all drawn.
    const dots = dotsOn(container)
    expect(dots).toEqual(expect.arrayContaining(['4:1', '3:0', '1:3'])) // x32010
    expect(dots).toEqual(expect.arrayContaining(['1:3', '2:5', '5:3'])) // x35553
    expect(dots).toEqual(expect.arrayContaining(['0:8', '2:10', '5:8'])) // 8aa988
  })

  it('names the chord in the panel title', () => {
    const container = guitar('Am')
    expect(container.querySelector('.fb-chord-name')).toBeNull()
    turnOnChordMode()
    expect(container.querySelector('.fb-chord-name')!.textContent).toBe('Am')
  })

  it('draws a barre bar spanning the barred strings', () => {
    const container = guitar('F')
    turnOnChordMode()

    // F leads with the full 1st-fret barre.
    expect(positionLabel(container)).toMatch(/^fr 1 · /)
    const bars = container.querySelectorAll('rect.fb-barre')
    expect(bars.length).toBeGreaterThan(0)
    // The 1st-fret barre covers all six strings.
    const tallest = Math.max(
      ...[...bars].map((b) => Number(b.getAttribute('height'))),
    )
    expect(tallest).toBeGreaterThan(5 * STRING_GAP)
  })

  it('marks the strings each shape does not play', () => {
    const container = guitar('D')
    turnOnChordMode()
    // Open D mutes the low E and A; the shapes up the neck mute one each.
    expect(container.querySelectorAll('text.fb-mute').length).toBeGreaterThan(2)
  })

  it('calls an open-string shape "open" whatever fret it stops', () => {
    // Open Am frets a C at the 1st fret, but it's played at the nut.
    const container = guitar('Am')
    turnOnChordMode()
    expect(positionLabel(container)).toMatch(/^open · /)
  })

  it('slides the trio up the neck with the arrows', () => {
    const container = guitar('C')
    turnOnChordMode()
    expect(positionLabel(container)).toBe('open · fr 3 · fr 8')

    fireEvent.click(screen.getByRole('button', { name: 'Next shapes' }))
    expect(positionLabel(container)).toBe('fr 3 · fr 8 · fr 12')
    expect(boxes(container)).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Previous shapes' }))
    expect(positionLabel(container)).toBe('open · fr 3 · fr 8')
  })

  it('stops at both ends of the neck', () => {
    const container = guitar('C')
    turnOnChordMode()
    const prev = screen.getByRole('button', { name: 'Previous shapes' })
    const next = screen.getByRole('button', { name: 'Next shapes' })

    expect(prev.hasAttribute('disabled')).toBe(true)
    for (let i = 0; i < 10; i++) fireEvent.click(next)
    expect(next.hasAttribute('disabled')).toBe(true)
    // Still three boxes at the far end — the window never runs short.
    expect(boxes(container)).toHaveLength(3)
  })

  it('returns to the nut when the chord changes', () => {
    const props = {
      label: 'Guitar',
      tuning: GUITAR_TUNING,
      fretCount: FRET_COUNT,
      heldNotes: new Set<number>(),
    }
    const { container, rerender } = render(
      <FretboardView {...props} chordSymbol="C" />,
    )
    turnOnChordMode()
    fireEvent.click(screen.getByRole('button', { name: 'Next shapes' }))
    expect(positionLabel(container)).toBe('fr 3 · fr 8 · fr 12')

    rerender(<FretboardView {...props} chordSymbol="G" />)
    expect(positionLabel(container)).toBe('open · fr 3 · fr 7')
    expect(container.querySelector('.fb-chord-name')!.textContent).toBe('G')
  })

  it('falls back to the note view when nothing is recognisable', () => {
    const container = guitar(null)
    expect(
      screen.getByRole('button', { name: 'Chord' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(boxes(container)).toHaveLength(0)
    expect(positionLabel(container)).toBe('open')
  })

  it('leaves Auto to switch back to the note view', () => {
    const container = guitar('C')
    turnOnChordMode()
    expect(boxes(container)).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    expect(boxes(container)).toHaveLength(0)
    expect(container.querySelector('.fb-chord-name')).toBeNull()
    expect(positionLabel(container)).not.toContain('·')
  })

  it('offers no chord mode to an instrument without a chord symbol', () => {
    render(
      <FretboardView
        label="Bass"
        tuning={BASS_TUNING}
        fretCount={FRET_COUNT}
        heldNotes={new Set([45, 52, 57])}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Chord' })).toBeNull()
  })
})
