interface Props {
  inputs: string[]
  selectedInput: number | null
  onSelect: (index: number) => void
  onRefresh: () => void
}

/** Desktop-only MIDI input chooser (keyboards, IAC buses, etc.). */
export function InputPicker({ inputs, selectedInput, onSelect, onRefresh }: Props) {
  return (
    <div className="input-picker">
      <label className="input-picker-label" htmlFor="midi-input">
        MIDI input
      </label>
      <select
        id="midi-input"
        className="input-picker-select"
        value={selectedInput ?? ''}
        onChange={(e) => {
          if (e.target.value !== '') onSelect(Number(e.target.value))
        }}
      >
        <option value="" disabled>
          {inputs.length ? 'Choose a device…' : 'No MIDI inputs found'}
        </option>
        {inputs.map((name, i) => (
          <option key={`${i}-${name}`} value={i}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="input-picker-refresh"
        onClick={onRefresh}
        title="Re-scan MIDI inputs"
      >
        ↻
      </button>
    </div>
  )
}
