import type { ConnectionStatus } from '../hooks/usePushMidi'

const LABELS: Record<ConnectionStatus, string> = {
  'no-input': 'Pick a MIDI input',
  listening: 'Listening',
  demo: 'Demo mode',
}

interface Props {
  status: ConnectionStatus
  onToggleDemo: () => void
}

export function StatusIndicator({ status, onToggleDemo }: Props) {
  return (
    <div className="status-indicator">
      <span className={`status-dot status-dot--${status}`} aria-hidden />
      <span className="status-label">{LABELS[status]}</span>
      <button type="button" className="status-demo-btn" onClick={onToggleDemo}>
        {status === 'demo' ? 'Stop demo' : 'Demo'}
      </button>
    </div>
  )
}
