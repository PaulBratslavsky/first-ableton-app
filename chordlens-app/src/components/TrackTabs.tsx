import { useRef } from 'react'
import type { AbletonTrack } from '#/lib/ableton'

interface Props {
  /** Tracks with a ChordLens device on them. */
  tracks: AbletonTrack[]
  /** Currently watched track index, or null for all of them at once. */
  value: number | null
  onPick: (index: number | null) => void
  /** Track indices sounding a note right now, so you can see who's playing. */
  playing: Set<number>
  /** Id of the region the tabs switch, for assistive tech. */
  controls?: string
}

/** `null` (All) sits first; the rest follow Live's track order. */
type Tab = number | null

/**
 * Chooses which Ableton track the views follow.
 *
 * Hidden until a second device shows up — with one track there's nothing to
 * choose. Tabs rather than a row of toggles: only one can be active, and that
 * needs to be obvious at a glance while you're playing.
 */
export function TrackTabs({ tracks, value, onPick, playing, controls }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  if (tracks.length < 2) return null

  const tabs: Tab[] = [null, ...tracks.map((t) => t.index)]
  const current = tabs.indexOf(value)

  /** Arrow keys walk the bar, the way a tablist is expected to behave. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step =
      e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -Infinity : e.key === 'End' ? Infinity : 0
    if (!step) return
    e.preventDefault()
    const next =
      step === -Infinity
        ? 0
        : step === Infinity
          ? tabs.length - 1
          : (current + step + tabs.length) % tabs.length
    onPick(tabs[next])
    // Move focus with the selection, so the next arrow press continues from here.
    const buttons = barRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }

  const tab = (key: Tab, label: string, sounding: boolean, title: string) => {
    const on = value === key
    return (
      <button
        key={key ?? 'all'}
        type="button"
        role="tab"
        aria-selected={on}
        aria-controls={controls}
        tabIndex={on ? 0 : -1}
        className={`track-tab${on ? ' track-tab--on' : ''}`}
        onClick={() => onPick(key)}
        title={title}
      >
        {key !== null && (
          // Always rendered, so a track lighting up never nudges the bar.
          // Decorative: the tab's name must stay the track's name.
          <span
            className={`track-dot${sounding ? ' track-dot--on' : ''}`}
            aria-hidden="true"
          />
        )}
        {label}
      </button>
    )
  }

  return (
    <div
      className="track-tabs"
      role="tablist"
      aria-label="Ableton track"
      ref={barRef}
      onKeyDown={onKeyDown}
    >
      {tab(null, 'All tracks', false, 'Fold every track into one chord')}
      {tracks.map((t) =>
        tab(
          t.index,
          t.name || `Track ${t.index + 1}`,
          playing.has(t.index),
          playing.has(t.index)
            ? `"${t.name}" is playing — show only this track`
            : `Show only what "${t.name}" is playing`,
        ),
      )}
    </div>
  )
}
