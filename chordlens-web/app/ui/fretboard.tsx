import { on, type Handle } from 'remix/ui'
import {
  shapeWindowPositions,
  autoAnchor,
  onePerPitchClass,
  noteName,
  pitchClass,
} from '../music/music.ts'
import { pitchColor, textOn } from '../music/colors.ts'
import { NOTE_NAMES } from '../music/config.ts'

const LABEL_W = 30
const OPEN_W = 30
const FRET_W = 40
const STRING_GAP = 26
const PAD_Y = 22
const DOT_R = 9
const SPAN = 4
const INLAY_FRETS = new Set([3, 5, 7, 9, 15])
const DOUBLE_INLAY = 12

interface Props {
  tuning: number[]
  fretCount: number
  heldNotes: Set<number>
  label: string
  keyPcs?: Set<number> | null
  scaleGuide?: Set<number> | null
  useFlats?: boolean
}

/** Remix 3 port of FretboardView — position box with ◀▶ / Auto / All / 1×. */
export function Fretboard(handle: Handle<Props>) {
  // local view state
  let autoMode = true
  let manualBase = 0
  let onePerNote = true
  let showAll = false

  return () => {
    const { tuning, fretCount, heldNotes, label, keyPcs, scaleGuide, useFlats = false } =
      handle.props
    const strings = tuning.length
    const nutX = LABEL_W + OPEN_W
    const width = nutX + fretCount * FRET_W + 12
    const height = PAD_Y * 2 + (strings - 1) * STRING_GAP
    const stringY = (s: number) => PAD_Y + (strings - 1 - s) * STRING_GAP
    const fretCenterX = (f: number) =>
      f === 0 ? LABEL_W + OPEN_W / 2 : nutX + (f - 0.5) * FRET_W

    const maxBase = Math.max(0, fretCount - SPAN)
    const auto = autoAnchor(heldNotes, tuning, fretCount, SPAN)
    const span = showAll ? fretCount : SPAN
    const base = showAll
      ? 0
      : autoMode
        ? auto
        : Math.min(Math.max(0, manualBase), maxBase)

    const litAll = shapeWindowPositions(heldNotes, tuning, fretCount, base, span)
    const lit = onePerNote ? onePerPitchClass(litAll, tuning) : litAll
    const litKeys = new Set(lit.map((p) => `${p.string}-${p.fret}`))
    const scaleRaw = scaleGuide
      ? shapeWindowPositions(new Set(scaleGuide), tuning, fretCount, base, span)
      : []
    const scaleDeduped = onePerNote ? onePerPitchClass(scaleRaw, tuning) : scaleRaw
    const scaleDots = scaleDeduped.filter((p) => !litKeys.has(`${p.string}-${p.fret}`))

    const move = (delta: number) => {
      showAll = false
      autoMode = false
      manualBase = Math.min(maxBase, Math.max(0, base + delta))
      handle.update()
    }

    return (
      <figure className="fretboard">
        <figcaption className="view-title view-title--row">
          <span>{label}</span>
          <span className="fb-pos">
            <button
              type="button"
              className="fb-pos-btn"
              disabled={!showAll && base <= 0}
              mix={on('click', () => move(-1))}
            >
              ◀
            </button>
            <span className="fb-pos-label">
              {showAll ? 'all' : base === 0 ? 'open' : `fr ${base}–${base + SPAN}`}
            </span>
            <button
              type="button"
              className="fb-pos-btn"
              disabled={!showAll && base >= maxBase}
              mix={on('click', () => move(1))}
            >
              ▶
            </button>
            <button
              type="button"
              className={`fb-pos-auto${autoMode && !showAll ? ' fb-pos-auto--on' : ''}`}
              mix={on('click', () => {
                showAll = false
                autoMode = true
                handle.update()
              })}
            >
              Auto
            </button>
            <button
              type="button"
              className={`fb-pos-auto${showAll ? ' fb-pos-auto--on' : ''}`}
              mix={on('click', () => {
                showAll = true
                handle.update()
              })}
            >
              All
            </button>
            <button
              type="button"
              className={`fb-pos-auto${onePerNote ? ' fb-pos-auto--on' : ''}`}
              mix={on('click', () => {
                onePerNote = !onePerNote
                handle.update()
              })}
            >
              1×
            </button>
          </span>
        </figcaption>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${label} fretboard`}
        >
          <rect
            x={nutX}
            y={PAD_Y}
            width={fretCount * FRET_W}
            height={(strings - 1) * STRING_GAP}
            className="fb-surface"
          />

          {!showAll && (
            <rect
              x={base === 0 ? LABEL_W : nutX + base * FRET_W}
              y={PAD_Y}
              width={
                nutX + Math.min(fretCount, base + SPAN) * FRET_W -
                (base === 0 ? LABEL_W : nutX + base * FRET_W)
              }
              height={(strings - 1) * STRING_GAP}
              className="fb-window"
            />
          )}

          {Array.from({ length: fretCount }, (_, i) => i + 1).map((f) => {
            const cx = fretCenterX(f)
            const cy = height / 2
            if (f === DOUBLE_INLAY) {
              return (
                <g key={`inlay-${f}`}>
                  <circle cx={cx} cy={cy - STRING_GAP / 2} r={3} className="fb-inlay" />
                  <circle cx={cx} cy={cy + STRING_GAP / 2} r={3} className="fb-inlay" />
                </g>
              )
            }
            return INLAY_FRETS.has(f) ? (
              <circle key={`inlay-${f}`} cx={cx} cy={cy} r={3} className="fb-inlay" />
            ) : null
          })}

          {Array.from({ length: fretCount + 1 }, (_, f) => (
            <line
              key={`fret-${f}`}
              x1={nutX + f * FRET_W}
              y1={PAD_Y}
              x2={nutX + f * FRET_W}
              y2={PAD_Y + (strings - 1) * STRING_GAP}
              className={f === 0 ? 'fb-nut' : 'fb-fret'}
            />
          ))}

          {Array.from({ length: fretCount }, (_, i) => i + 1)
            .filter((f) => INLAY_FRETS.has(f) || f === DOUBLE_INLAY)
            .map((f) => (
              <text key={`num-${f}`} x={fretCenterX(f)} y={height - 4} className="fb-fret-num">
                {f}
              </text>
            ))}

          {tuning.map((open, s) => {
            const y = stringY(s)
            return (
              <g key={`string-${s}`}>
                <line x1={nutX} y1={y} x2={width - 12} y2={y} className="fb-string" />
                <text x={LABEL_W - 6} y={y} className="fb-open-label">
                  {NOTE_NAMES[pitchClass(open)]}
                </text>
              </g>
            )
          })}

          {scaleDots.map(({ string, fret }) => (
            <circle
              key={`scale-${string}-${fret}`}
              cx={fretCenterX(fret)}
              cy={stringY(string)}
              r={3.2}
              className="fb-scale-dot"
              style={{ fill: pitchColor(tuning[string] + fret) }}
            />
          ))}

          {lit.map(({ string, fret }) => {
            const pitch = tuning[string] + fret
            const color = pitchColor(pitch)
            const outside = keyPcs != null && !keyPcs.has(pitchClass(pitch))
            return (
              <g key={`lit-${string}-${fret}`}>
                <circle
                  cx={fretCenterX(fret)}
                  cy={stringY(string)}
                  r={DOT_R}
                  className={`fb-note${outside ? ' fb-note--outside' : ''}`}
                  style={{ fill: color }}
                />
                <text
                  x={fretCenterX(fret)}
                  y={stringY(string)}
                  className="fb-note-label"
                  style={{ fill: textOn(color) }}
                >
                  {noteName(pitch, useFlats).replace(/[0-9]/g, '')}
                </text>
              </g>
            )
          })}
        </svg>
      </figure>
    )
  }
}
