// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SectionHead } from './SectionHead'
import { FretboardView } from './FretboardView'
import { NotationView } from './NotationView'
import { GUITAR_TUNING, FRET_COUNT } from '../lib/config'

afterEach(cleanup)

describe('SectionHead', () => {
  it('folds the section from its own title', () => {
    const onToggle = vi.fn()
    render(<SectionHead title="Piano" open onToggle={onToggle} controls="body" />)
    const toggle = screen.getByRole('button', { name: /Piano/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBe('body')

    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('reports being closed', () => {
    render(<SectionHead title="Piano" open={false} onToggle={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: /Piano/ }).getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('stays a plain heading when there is nothing to collapse', () => {
    render(<SectionHead title="Piano" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Piano')).toBeTruthy()
  })

  it("keeps the section's own controls alongside the title", () => {
    render(
      <SectionHead title="Push" open onToggle={vi.fn()}>
        <button type="button">Names</button>
      </SectionHead>,
    )
    expect(screen.getByRole('button', { name: 'Names' })).toBeTruthy()
  })

  it('puts `actions` beside the title, out of the right-hand slot', () => {
    // The piano's now-playing readout is positioned at the right edge and out
    // of flow, so a right-aligned control lands underneath it.
    const { container } = render(
      <SectionHead
        title="Piano"
        open
        onToggle={vi.fn()}
        actions={<button type="button">Names</button>}
      >
        <span className="now-playing">Bbm</span>
      </SectionHead>,
    )
    const lead = container.querySelector('.section-lead')!
    expect(lead.contains(screen.getByRole('button', { name: 'Names' }))).toBe(true)
    expect(lead.querySelector('.now-playing')).toBeNull()
  })
})

describe('collapsing a view', () => {
  it('hides the neck but keeps the fretboard header reachable', () => {
    const props = {
      label: 'Guitar',
      tuning: GUITAR_TUNING,
      fretCount: FRET_COUNT,
      heldNotes: new Set<number>(),
    }
    const { container, rerender } = render(
      <FretboardView {...props} open onToggle={vi.fn()} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()

    rerender(<FretboardView {...props} open={false} onToggle={vi.fn()} />)
    expect(container.querySelector('svg')).toBeNull()
    // The header has to survive, or there's no way to open it again.
    expect(screen.getByRole('button', { name: /Guitar/ })).toBeTruthy()
  })

  it('hides the staff but keeps the notation header reachable', () => {
    const { container, rerender } = render(
      <NotationView heldNotes={new Set([60, 64, 67])} open onToggle={vi.fn()} />,
    )
    expect(container.querySelector('.notation-canvas')).not.toBeNull()

    rerender(
      <NotationView
        heldNotes={new Set([60, 64, 67])}
        open={false}
        onToggle={vi.fn()}
      />,
    )
    expect(container.querySelector('.notation-canvas')).toBeNull()
    expect(screen.getByRole('button', { name: /Notation/ })).toBeTruthy()
  })

  it('leaves the fretboard uncollapsible when the page does not wire it up', () => {
    const { container } = render(
      <FretboardView
        label="Bass"
        tuning={GUITAR_TUNING}
        fretCount={FRET_COUNT}
        heldNotes={new Set()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Bass/ })).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
