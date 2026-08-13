// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FretboardView } from './FretboardView'
import { PianoView } from './PianoView'
import { PushView } from './PushView'
import { GUITAR_TUNING, FRET_COUNT, PIANO_LOW, PIANO_HIGH } from '../lib/config'

afterEach(cleanup)

const texts = (container: HTMLElement, selector: string) =>
  [...container.querySelectorAll(selector)].map((n) => n.textContent ?? '')

/** Flat spellings all look like a letter followed by a lowercase b. */
const anyFlats = (labels: string[]) => labels.some((t) => /^[A-G]b/.test(t))

describe('note-name overlay — fretboard', () => {
  const guitar = (showNames: boolean, scaleGuide?: Set<number>) =>
    render(
      <FretboardView
        label="Guitar"
        tuning={GUITAR_TUNING}
        fretCount={FRET_COUNT}
        heldNotes={new Set()}
        scaleGuide={scaleGuide}
        showNames={showNames}
        onToggleNames={() => {}}
      />,
    ).container

  it('names every position on the neck when on, and none when off', () => {
    expect(guitar(false).querySelectorAll('text.fb-name')).toHaveLength(0)
    cleanup()
    // Six strings, frets 0..15 inclusive.
    expect(guitar(true).querySelectorAll('text.fb-name')).toHaveLength(6 * 16)
  })

  it('spells sharps even when the key would use flats', () => {
    // The overlay maps the neck; it isn't a reading of the current key.
    const container = render(
      <FretboardView
        label="Guitar"
        tuning={GUITAR_TUNING}
        fretCount={FRET_COUNT}
        heldNotes={new Set()}
        useFlats
        showNames
        onToggleNames={() => {}}
      />,
    ).container
    const labels = texts(container, 'text.fb-name')
    expect(anyFlats(labels)).toBe(false)
    expect(labels).toContain('A#')
  })

  it('lights the in-key letters instead of stacking dots behind them', () => {
    // C major, so every name is either a natural or greyed out.
    const container = guitar(true, new Set([0, 2, 4, 5, 7, 9, 11]))
    const lit = texts(container, 'text.fb-name--in-key')
    expect(lit.length).toBeGreaterThan(0)
    expect(lit.every((t) => !t.includes('#'))).toBe(true)
    // The guide's separate dots are gone — the letters carry the key now.
    expect(container.querySelectorAll('circle.fb-scale-dot')).toHaveLength(0)
  })

  it('only offers the toggle when the page wires one up', () => {
    render(
      <FretboardView
        label="Bass"
        tuning={GUITAR_TUNING}
        fretCount={FRET_COUNT}
        heldNotes={new Set()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Names' })).toBeNull()
  })

  it('reports toggles to the page so each view stays independent', () => {
    const onToggleNames = vi.fn()
    render(
      <FretboardView
        label="Guitar"
        tuning={GUITAR_TUNING}
        fretCount={FRET_COUNT}
        heldNotes={new Set()}
        onToggleNames={onToggleNames}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Names' }))
    expect(onToggleNames).toHaveBeenCalledOnce()
  })
})

describe('note-name overlay — piano', () => {
  const piano = (showNames: boolean) =>
    render(<PianoView heldNotes={new Set()} showNames={showNames} />).container

  it('names only the Cs when off, and every key when on', () => {
    // C2..C6 — one per octave across the span.
    expect(texts(piano(false), 'text.key-label').every((t) => t.startsWith('C')))
      .toBe(true)
    cleanup()
    expect(piano(true).querySelectorAll('text.key-label')).toHaveLength(
      PIANO_HIGH - PIANO_LOW + 1,
    )
  })

  it('spells sharps and keeps the octave only on the Cs', () => {
    const labels = texts(piano(true), 'text.key-label')
    expect(anyFlats(labels)).toBe(false)
    expect(labels).toContain('C#')
    expect(labels).toContain('C3') // the octave markers keep their number
    expect(labels).not.toContain('D3')
  })

  it('darkens the label on a held key so it stays legible on the paint', () => {
    const { container } = render(
      <PianoView heldNotes={new Set([60])} showNames />,
    )
    expect(container.querySelectorAll('text.key-label--on-held')).toHaveLength(1)
  })
})

describe('note-name overlay — push', () => {
  it('names every pad when on, and only the roots when off', () => {
    const { container } = render(
      <PushView heldNotes={new Set()} scalePcs={new Set([0, 2, 4])} rootPc={0} />,
    )
    const roots = container.querySelectorAll('text.push-label').length
    expect(roots).toBeGreaterThan(0)
    cleanup()

    const { container: all } = render(
      <PushView
        heldNotes={new Set()}
        scalePcs={new Set([0, 2, 4])}
        rootPc={0}
        showNames
      />,
    )
    expect(all.querySelectorAll('text.push-label')).toHaveLength(64)
    // Non-root pads recede so the scale still reads at a glance.
    expect(all.querySelectorAll('text.push-label--dim').length).toBe(64 - roots)
    expect(anyFlats(texts(all, 'text.push-label'))).toBe(false)
  })
})
