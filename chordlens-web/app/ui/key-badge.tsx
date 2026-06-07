import { on, type Handle } from 'remix/ui'
import { keyName, type MusicalKey, type Mode } from '../music/theory.ts'

const MODES: Mode[] = ['major', 'minor']
const KEY_OPTIONS: { id: string; label: string; key: MusicalKey }[] = MODES.flatMap((mode) =>
  Array.from({ length: 12 }, (_, tonic) => {
    const key = { tonic, mode }
    return { id: `${tonic}:${mode}`, label: keyName(key), key }
  }),
)

interface Props {
  value: MusicalKey | null
  isAuto: boolean
  onPick: (key: MusicalKey | null) => void
  autoLabel?: string
}

/** Remix 3 port of KeyBadge — detected/Ableton key + manual override. */
export function KeyBadge(handle: Handle<Props>) {
  return () => {
    const { value, isAuto, onPick, autoLabel = 'Auto' } = handle.props
    const selected = isAuto ? 'auto' : value ? `${value.tonic}:${value.mode}` : 'auto'
    return (
      <label className="key-badge">
        <span className="key-badge-label">Key</span>
        <select
          className="key-badge-select"
          value={selected}
          mix={on('change', (event) => {
            const v = (event.currentTarget as HTMLSelectElement).value
            if (v === 'auto') {
              onPick(null)
              return
            }
            const opt = KEY_OPTIONS.find((o) => o.id === v)
            if (opt) onPick(opt.key)
          })}
        >
          <option value="auto">
            {autoLabel}
            {isAuto && value ? ` — ${keyName(value)}` : ''}
          </option>
          {KEY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
}
