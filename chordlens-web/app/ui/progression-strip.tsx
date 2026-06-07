import { on, type Handle } from 'remix/ui'
import { PITCH_COLORS } from '../music/colors.ts'

export interface ChordHistoryEntry {
  label: string
  rootPc: number | null
  notes: string[]
  pitches: number[]
  t: number // ms timestamp when this chord became active (for timing-accurate notation)
}

interface Props {
  history: ChordHistoryEntry[]
  onClear: () => void
}

/** Remix 3 port of ProgressionStrip — chips + chords/notes toggle. */
export function ProgressionStrip(handle: Handle<Props>) {
  let showNotes = false

  return () => {
    const { history, onClear } = handle.props
    return (
      <div className="progression">
        <span className="progression-label">Progression</span>
        <div className="progression-chips">
          {history.length === 0 ? (
            <span className="progression-empty">play a few chords…</span>
          ) : (
            history.map((e, i) => (
              <span
                key={`${i}-${e.label}`}
                className="chord-chip"
                style={{
                  'border-color': e.rootPc != null ? PITCH_COLORS[e.rootPc] : 'var(--line)',
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
          mix={on('click', () => {
            showNotes = !showNotes
            handle.update()
          })}
        >
          {showNotes ? '♪ Notes' : 'Chords'}
        </button>
        <button
          type="button"
          className="progression-clear"
          disabled={history.length === 0}
          mix={on('click', () => onClear())}
        >
          Clear
        </button>
      </div>
    )
  }
}
