import type { AbletonTrack } from '#/lib/ableton'

interface Props {
  /** Tracks with a ChordLens device on them. */
  tracks: AbletonTrack[]
  /** Currently watched track index, or null for all of them at once. */
  value: number | null
  onPick: (index: number | null) => void
  /** Track indices sounding a note right now, so you can see who's playing. */
  playing: Set<number>
}

/**
 * Chooses which Ableton track the views follow. Hidden until a second device
 * shows up — with one track there's nothing to choose, and the control would
 * just be noise in the header.
 */
export function TrackPicker({ tracks, value, onPick, playing }: Props) {
  if (tracks.length < 2) return null

  return (
    <span className="track-picker" role="group" aria-label="Ableton track">
      <button
        type="button"
        className={`pin-btn${value === null ? ' pin-btn--active' : ''}`}
        onClick={() => onPick(null)}
        title="Fold every track into one chord"
      >
        All
      </button>
      {tracks.map((track) => (
        <button
          key={track.index}
          type="button"
          className={`pin-btn${value === track.index ? ' pin-btn--active' : ''}${
            playing.has(track.index) ? ' pin-btn--sounding' : ''
          }`}
          onClick={() => onPick(track.index)}
          title={`Follow "${track.name}" only`}
        >
          {track.name || `Track ${track.index + 1}`}
        </button>
      ))}
    </span>
  )
}
