/**
 * Header chip for the ChordLens ⇄ Ableton bridge (the Max for Live device).
 * Shows connection state + live tempo, with a transport play/stop toggle.
 * Reuses the .status-indicator styling from StatusIndicator.
 */
interface Props {
  connected: boolean
  tempo: number | null
  isPlaying: boolean
  onTogglePlay: () => void
}

export function AbletonStatus({ connected, tempo, isPlaying, onTogglePlay }: Props) {
  return (
    <div
      className="status-indicator"
      title={
        connected
          ? 'Connected to the ChordLens Max for Live device'
          : 'Start Ableton with the ChordLens device to connect'
      }
    >
      <span
        className={`status-dot status-dot--${connected ? 'listening' : 'no-input'}`}
        aria-hidden
      />
      <span className="status-label">
        {connected
          ? `Ableton${tempo != null ? ` · ${Math.round(tempo)} BPM` : ''}`
          : 'Ableton offline'}
      </span>
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
