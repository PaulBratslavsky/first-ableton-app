import { keyName, type MusicalKey, type Mode } from '../lib/theory'

interface Props {
  /** Effective key (manual override, or auto-detected). */
  value: MusicalKey | null
  isAuto: boolean
  onPick: (key: MusicalKey | null) => void
}

const MODES: Mode[] = ['major', 'minor']

// Build the option list once: Auto, then every major then every minor key.
const KEY_OPTIONS: { id: string; label: string; key: MusicalKey }[] = MODES.flatMap(
  (mode) =>
    Array.from({ length: 12 }, (_, tonic) => {
      const key = { tonic, mode }
      return { id: `${tonic}:${mode}`, label: keyName(key), key }
    }),
)

/** Detected-key readout with an Auto / manual-override dropdown. */
export function KeyBadge({ value, isAuto, onPick }: Props) {
  const selected = isAuto ? 'auto' : value ? `${value.tonic}:${value.mode}` : 'auto'

  return (
    <label className="key-badge">
      <span className="key-badge-label">Key</span>
      <select
        className="key-badge-select"
        value={selected}
        onChange={(e) => {
          if (e.target.value === 'auto') {
            onPick(null)
            return
          }
          const opt = KEY_OPTIONS.find((o) => o.id === e.target.value)
          if (opt) onPick(opt.key)
        }}
      >
        <option value="auto">
          Auto{isAuto && value ? ` — ${keyName(value)}` : ''}
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
