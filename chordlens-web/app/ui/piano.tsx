import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'
import { PIANO_LOW, PIANO_HIGH } from '../music/config.ts'
import { pitchClass, noteName } from '../music/music.ts'
import { pitchColor } from '../music/colors.ts'

// Geometry (SVG user units; scales via viewBox). Ported from the React PianoView.
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
  keyPcs?: Set<number> | null
  scaleGuide?: Set<number> | null
}

/** Remix 3 port of PianoView — SVG keyboard, keys colored by pitch-class. */
export function Piano(handle: Handle<Props>) {
  return () => {
    const { heldNotes, keyPcs, scaleGuide } = handle.props
    const outside = (p: number) => keyPcs != null && !keyPcs.has(pitchClass(p))
    const inScale = (p: number) =>
      scaleGuide != null && scaleGuide.has(pitchClass(p)) && !heldNotes.has(p)

    return (
      <svg
        viewBox={`0 0 ${width} ${WHITE_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Piano keyboard"
        mix={css({ width: '100%', maxHeight: '200px', display: 'block' })}
      >
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
                stroke={held && outside(k.pitch) ? '#f4f6fb' : '#c8cdd8'}
                stroke-width={held && outside(k.pitch) ? 2 : 1}
                stroke-dasharray={held && outside(k.pitch) ? '3 2' : undefined}
                style={{ fill: held ? pitchColor(k.pitch) : '#f6f8fc' }}
              />
              {inScale(k.pitch) && (
                <circle
                  cx={k.x + WHITE_W / 2}
                  cy={WHITE_H - 24}
                  r={3.2}
                  style={{ fill: pitchColor(k.pitch), opacity: 0.32 }}
                />
              )}
              {isC && (
                <text
                  x={k.x + WHITE_W / 2}
                  y={WHITE_H - 8}
                  text-anchor="middle"
                  font-size={9}
                  fill="#8a90a0"
                >
                  {noteName(k.pitch)}
                </text>
              )}
            </g>
          )
        })}

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
                stroke="#000000"
                stroke-width={0.5}
                style={{ fill: held ? pitchColor(k.pitch) : '#15171c' }}
              />
              {inScale(k.pitch) && (
                <circle
                  cx={k.x + BLACK_W / 2}
                  cy={BLACK_H - 12}
                  r={3}
                  style={{ fill: pitchColor(k.pitch), opacity: 0.32 }}
                />
              )}
            </g>
          )
        })}
      </svg>
    )
  }
}
