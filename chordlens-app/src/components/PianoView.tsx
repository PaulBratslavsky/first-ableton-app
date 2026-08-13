import { PIANO_LOW, PIANO_HIGH } from '../lib/config'
import { pitchClass, noteName } from '../lib/music'
import { pitchColor } from '../lib/colors'

// Geometry (SVG user units; the whole thing scales via viewBox).
const WHITE_W = 24
const WHITE_H = 150
const BLACK_W = 14
const BLACK_H = 95

const BLACK_PCS = new Set([1, 3, 6, 8, 10]) // C# D# F# G# A#

interface Key {
  pitch: number
  x: number
  isBlack: boolean
}

/** Lay keys out left-to-right; black keys are centered on the white/white seam. */
function buildKeys(): { keys: Key[]; width: number } {
  const keys: Key[] = []
  let whiteCount = 0
  for (let pitch = PIANO_LOW; pitch <= PIANO_HIGH; pitch++) {
    const isBlack = BLACK_PCS.has(pitchClass(pitch))
    if (isBlack) {
      keys.push({ pitch, x: whiteCount * WHITE_W - BLACK_W / 2, isBlack })
    } else {
      keys.push({ pitch, x: whiteCount * WHITE_W, isBlack })
      whiteCount++
    }
  }
  return { keys, width: whiteCount * WHITE_W }
}

const { keys, width } = buildKeys()
const whiteKeys = keys.filter((k) => !k.isBlack)
const blackKeys = keys.filter((k) => k.isBlack)

interface Props {
  heldNotes: Set<number>
  /** Pitch-classes in the current key; held notes outside it get flagged. */
  keyPcs?: Set<number> | null
  /** When set, faintly mark in-scale keys that aren't currently held. */
  scaleGuide?: Set<number> | null
  /**
   * Name every key, not just the Cs. Always spelled with sharps — the overlay
   * is a fixed map of the keyboard, not a reading of the current key.
   */
  showNames?: boolean
}

export function PianoView({
  heldNotes,
  keyPcs,
  scaleGuide,
  showNames = false,
}: Props) {
  const outside = (pitch: number) =>
    keyPcs != null && !keyPcs.has(pitchClass(pitch))
  const inScale = (pitch: number) =>
    scaleGuide != null &&
    scaleGuide.has(pitchClass(pitch)) &&
    !heldNotes.has(pitch)

  return (
    <svg
      className="piano"
      viewBox={`0 0 ${width} ${WHITE_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Piano keyboard"
    >
      {/* White keys (drawn first so black keys sit on top). */}
      {whiteKeys.map((k) => {
        const held = heldNotes.has(k.pitch)
        const isC = pitchClass(k.pitch) === 0
        return (
          <g key={k.pitch}>
            <rect
              x={k.x}
              y={0}
              width={WHITE_W}
              height={WHITE_H}
              rx={3}
              className={`key key--white${held ? ' key--held' : ''}${
                held && outside(k.pitch) ? ' key--outside' : ''
              }`}
              style={held ? { fill: pitchColor(k.pitch) } : undefined}
            />
            {inScale(k.pitch) && (
              <circle
                cx={k.x + WHITE_W / 2}
                cy={WHITE_H - 24}
                r={3.2}
                className="key-scale-dot"
                style={{ fill: pitchColor(k.pitch) }}
              />
            )}
            {(isC || showNames) && (
              <text
                x={k.x + WHITE_W / 2}
                y={WHITE_H - 8}
                className={`key-label${held ? ' key-label--on-held' : ''}`}
              >
                {showNames && !isC
                  ? noteName(k.pitch).replace(/[0-9]/g, '')
                  : noteName(k.pitch)}
              </text>
            )}
          </g>
        )
      })}

      {/* Black keys. */}
      {blackKeys.map((k) => {
        const held = heldNotes.has(k.pitch)
        return (
          <g key={k.pitch}>
            <rect
              x={k.x}
              y={0}
              width={BLACK_W}
              height={BLACK_H}
              rx={2}
              className={`key key--black${held ? ' key--held' : ''}${
                held && outside(k.pitch) ? ' key--outside' : ''
              }`}
              style={held ? { fill: pitchColor(k.pitch) } : undefined}
            />
            {inScale(k.pitch) && !showNames && (
              <circle
                cx={k.x + BLACK_W / 2}
                cy={BLACK_H - 12}
                r={3}
                className="key-scale-dot"
                style={{ fill: pitchColor(k.pitch) }}
              />
            )}
            {showNames && (
              <text
                x={k.x + BLACK_W / 2}
                y={BLACK_H - 9}
                className={`key-label key-label--black${
                  held ? ' key-label--on-held' : ''
                }`}
              >
                {noteName(k.pitch).replace(/[0-9]/g, '')}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
