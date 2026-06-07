import { useEffect, useRef, useState } from 'react'
import type { ChordHistoryEntry } from '../hooks/useChordHistory'
import { PITCH_COLORS } from '../lib/colors'

interface Props {
  history: ChordHistoryEntry[]
  onClear: () => void
}

/**
 * Horizontal strip of the chords you've played, oldest → newest. Toggle between
 * chord symbols (C · Am · F) and the actual notes (C E G · A C E) — handy for
 * reading a melody/voicing rather than its chord name.
 */
export function ProgressionStrip({ history, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showNotes, setShowNotes] = useState(false)

  // Keep the newest chord in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [history.length])

  return (
    <div className="progression">
      <span className="progression-label">Progression</span>
      <div className="progression-chips" ref={scrollRef}>
        {history.length === 0 ? (
          <span className="progression-empty">play a few chords…</span>
        ) : (
          history.map((e, i) => (
            <span
              key={`${i}-${e.label}`}
              className="chord-chip"
              style={{
                borderColor:
                  e.rootPc != null ? PITCH_COLORS[e.rootPc] : 'var(--line)',
              }}
              title={showNotes ? e.label : e.notes.join(' ')}
            >
              {showNotes && e.notes.length ? e.notes.join(' ') : e.label}
            </span>
          ))
        )}
      </div>
      <button
        type="button"
        className={`progression-toggle${showNotes ? ' progression-toggle--active' : ''}`}
        onClick={() => setShowNotes((s) => !s)}
        title="Show each chord as its notes, or as a chord symbol"
      >
        {showNotes ? '♪ Notes' : 'Chords'}
      </button>
      <button
        type="button"
        className="progression-clear"
        onClick={onClear}
        disabled={history.length === 0}
      >
        Clear
      </button>
    </div>
  )
}
