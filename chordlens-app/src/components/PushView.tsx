import {
  PUSH_ROWS,
  PUSH_COLS,
  PUSH_BASE_NOTE,
  PUSH_ROW_OFFSET,
} from '../lib/config'
import { pitchClass, noteName } from '../lib/music'
import { pitchColor, textOn } from '../lib/colors'

// Geometry (SVG user units; scales via viewBox).
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

/**
 * Build the Push "chromatic" pad layout: an 8×8 grid, lowest note bottom-left,
 * each row a perfect fourth (PUSH_ROW_OFFSET) above the row below it.
 */
function buildPads(): Pad[] {
  const pads: Pad[] = []
  for (let row = 0; row < PUSH_ROWS; row++) {
    // row 0 is the bottom; SVG y grows downward, so the top row is drawn first.
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
  /** Notes currently sounding. */
  heldNotes: Set<number>
  /** Pitch-classes of the current key/scale to highlight. */
  scalePcs?: Set<number> | null
  /** Pitch-class of the scale root, emphasized. */
  rootPc?: number | null
}

/**
 * Ableton Push-style chromatic pad grid. Held notes glow in their pitch color;
 * in-scale pads are faintly tinted (root pads a little brighter and ringed);
 * out-of-scale pads stay dark — so you see the scale shape and what's playing.
 */
export function PushView({ heldNotes, scalePcs, rootPc }: Props) {
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
              x={pad.x}
              y={pad.y}
              width={PAD}
              height={PAD}
              rx={7}
              className="push-pad"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
            {isRoot && (
              <text
                x={pad.x + PAD / 2}
                y={pad.y + PAD / 2}
                className="push-label"
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
