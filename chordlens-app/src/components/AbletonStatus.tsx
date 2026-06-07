import type { BridgeStatus } from '#/lib/ableton'

/**
 * Header chip for the ChordLens ⇄ Ableton bridge (the Max for Live device).
 * Shows connection state + live tempo, with a manual reconnect button and a
 * transport play/stop toggle. Reuses the .status-indicator styling.
 */
interface Props {
  status: BridgeStatus
  tempo: number | null
  isPlaying: boolean
  onTogglePlay: () => void
  onReconnect: () => void
}

const DOT: Record<BridgeStatus, string> = {
  open: 'listening',
  connecting: 'demo', // reuse the blue "active" dot for the connecting state
  closed: 'no-input',
}

export function AbletonStatus({
  status,
  tempo,
  isPlaying,
  onTogglePlay,
  onReconnect,
}: Props) {
  const connected = status === 'open'
  const label =
    status === 'open'
      ? `Ableton${tempo != null ? ` · ${Math.round(tempo)} BPM` : ''}`
      : status === 'connecting'
        ? 'Connecting…'
        : 'Ableton offline'

  return (
    <div
      className="status-indicator"
      title={
        connected
          ? 'Connected to the ChordLens Max for Live device'
          : 'Not connected. Make sure the ChordLens device is on a track, then reconnect.'
      }
    >
      <span className={`status-dot status-dot--${DOT[status]}`} aria-hidden />
      <span className="status-label">{label}</span>
      <button
        type="button"
        className="status-icon-btn"
        onClick={onReconnect}
        title="Reconnect to the ChordLens device"
        aria-label="Reconnect"
      >
        ↻
      </button>
      <button
        type="button"
        className="status-demo-btn"
        onClick={onTogglePlay}
        disabled={!connected}
      >
        {isPlaying ? '⏹ Stop' : '▶ Play'}
      </button>
    </div>
  )
}
