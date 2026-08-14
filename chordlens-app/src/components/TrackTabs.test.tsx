// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TrackTabs } from './TrackTabs'

afterEach(cleanup)

const TRACKS = [
  { index: 1, name: 'Bass' },
  { index: 2, name: 'Chords' },
]

const setup = (
  value: number | null = null,
  playing = new Set<number>(),
  onPick = vi.fn(),
) => {
  const { container } = render(
    <TrackTabs tracks={TRACKS} value={value} onPick={onPick} playing={playing} />,
  )
  return { container, onPick }
}

const tab = (name: string) => screen.getByRole('tab', { name })

describe('TrackTabs', () => {
  it('stays out of the way until there is a choice to make', () => {
    const { container } = render(
      <TrackTabs
        tracks={[{ index: 1, name: 'Bass' }]}
        value={null}
        onPick={vi.fn()}
        playing={new Set()}
      />,
    )
    expect(container.querySelector('.track-tabs')).toBeNull()
  })

  it('offers All tracks plus every track, in Live order', () => {
    setup()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'All tracks',
      'Bass',
      'Chords',
    ])
  })

  it('reports the track you pick, and All to clear it', () => {
    const { onPick } = setup()
    fireEvent.click(tab('Chords'))
    expect(onPick).toHaveBeenCalledWith(2)
    fireEvent.click(tab('All tracks'))
    expect(onPick).toHaveBeenLastCalledWith(null)
  })

  it('selects exactly one tab', () => {
    setup(2)
    const selected = screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(selected.map((t) => t.textContent)).toEqual(['Chords'])
    expect(tab('Chords').className).toContain('track-tab--on')
    expect(tab('Bass').className).not.toContain('track-tab--on')
  })

  it('defaults to All tracks', () => {
    setup(null)
    expect(tab('All tracks').getAttribute('aria-selected')).toBe('true')
  })

  it('shows what is sounding without it reading as selected', () => {
    // Both playing, neither followed: the old pill row gave every button a
    // green border, so all three looked chosen at once.
    const { container } = setup(null, new Set([1, 2]))
    expect(container.querySelectorAll('.track-dot--on')).toHaveLength(2)
    expect(tab('Bass').getAttribute('aria-selected')).toBe('false')
    expect(tab('Chords').getAttribute('aria-selected')).toBe('false')
  })

  it('keeps a dot on every track so the bar never shifts', () => {
    const { container } = setup(null, new Set([2]))
    expect(container.querySelectorAll('.track-dot')).toHaveLength(TRACKS.length)
    expect(container.querySelectorAll('.track-dot--on')).toHaveLength(1)
  })

  it('walks the bar with the arrow keys', () => {
    const { onPick } = setup(null)
    fireEvent.keyDown(tab('All tracks'), { key: 'ArrowRight' })
    expect(onPick).toHaveBeenLastCalledWith(1)

    cleanup()
    const second = setup(1)
    fireEvent.keyDown(tab('Bass'), { key: 'ArrowLeft' })
    expect(second.onPick).toHaveBeenLastCalledWith(null)
  })

  it('wraps around, and jumps with Home/End', () => {
    const { onPick } = setup(2) // last tab
    fireEvent.keyDown(tab('Chords'), { key: 'ArrowRight' })
    expect(onPick).toHaveBeenLastCalledWith(null) // wrapped to All

    fireEvent.keyDown(tab('Chords'), { key: 'End' })
    expect(onPick).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(tab('Chords'), { key: 'Home' })
    expect(onPick).toHaveBeenLastCalledWith(null)
  })

  it('ignores keys that are not navigation', () => {
    const { onPick } = setup(null)
    fireEvent.keyDown(tab('All tracks'), { key: 'a' })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('keeps only the selected tab in the tab order', () => {
    setup(1)
    expect(tab('Bass').getAttribute('tabindex')).toBe('0')
    expect(tab('All tracks').getAttribute('tabindex')).toBe('-1')
    expect(tab('Chords').getAttribute('tabindex')).toBe('-1')
  })

  it('falls back to a number when a track has no name', () => {
    render(
      <TrackTabs
        tracks={[
          { index: 1, name: '' },
          { index: 4, name: 'Keys' },
        ]}
        value={null}
        onPick={vi.fn()}
        playing={new Set()}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Track 2' })).toBeTruthy()
  })
})
