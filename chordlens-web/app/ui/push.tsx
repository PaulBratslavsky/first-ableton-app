import type { Handle } from 'remix/ui'
import {
  PUSH_ROWS,
  PUSH_COLS,
  PUSH_BASE_NOTE,
  PUSH_ROW_OFFSET,
} from '../music/config.ts'
import { pitchClass, noteName } from '../music/music.ts'
import { pitchColor, textOn } from '../music/colors.ts'

const PAD = 42
const GAP = 6
const STEP = PAD + GAP
const WIDTH = PUSH_COLS * PAD + (PUSH_COLS - 1) * GAP
const HEIGHT = PUSH_ROWS * PAD + (PUSH_ROWS - 1) * GAP

interface Pad {
  note: number
  x: number
  y: number
}

function buildPads(): Pad[] {
  const pads: Pad[] = []
  for (let row = 0; row < PUSH_ROWS; row++) {
    const yIndex = PUSH_ROWS - 1 - row
    for (let col = 0; col < PUSH_COLS; col++) {
      pads.push({
        note: PUSH_BASE_NOTE + row * PUSH_ROW_OFFSET + col,
        x: col * STEP,
        y: yIndex * STEP,
      })
    }
  }
  return pads
}

const PADS = buildPads()

interface Props {
  heldNotes: Set<number>
  scalePcs?: Set<number> | null
  rootPc?: number | null
}

/** Remix 3 port of PushView — 8x8 chromatic pad grid. */
export function Push(handle: Handle<Props>) {
  return () => {
    const { heldNotes, scalePcs, rootPc } = handle.props
    return (
      <svg
        className="push"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Push chromatic pad grid"
      >
        {PADS.map((pad, i) => {
          const pc = pitchClass(pad.note)
          const color = pitchColor(pad.note)
          const held = heldNotes.has(pad.note)
          const inScale = scalePcs != null && scalePcs.has(pc)
          const isRoot = rootPc != null && pc === rootPc

          let fill = 'var(--panel-2)'
          let fillOpacity = 1
          let stroke = 'var(--line)'
          let strokeOpacity = 1
          let strokeWidth = 1

          if (held) {
            fill = color
            stroke = '#ffffff'
            strokeWidth = 2
          } else if (inScale) {
            fill = color
            fillOpacity = isRoot ? 0.34 : 0.16
            stroke = color
            strokeOpacity = isRoot ? 0.9 : 0.45
            strokeWidth = isRoot ? 2 : 1
          }

          return (
            <g key={i}>
              <rect
                className="push-pad"
                x={pad.x}
                y={pad.y}
                width={PAD}
                height={PAD}
                rx={7}
                fill={fill}
                fill-opacity={fillOpacity}
                stroke={stroke}
                stroke-opacity={strokeOpacity}
                stroke-width={strokeWidth}
              />
              {isRoot && (
                <text
                  className="push-label"
                  x={pad.x + PAD / 2}
                  y={pad.y + PAD / 2}
                  style={{ fill: held ? textOn(color) : color }}
                >
                  {noteName(pad.note)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    )
  }
}
