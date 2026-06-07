import { useMemo, useState } from 'react'
import {
  shapeWindowPositions,
  autoAnchor,
  onePerPitchClass,
  noteName,
  pitchClass,
} from '../lib/music'
import { pitchColor, textOn } from '../lib/colors'
import { NOTE_NAMES } from '../lib/config'

// Geometry.
const LABEL_W = 30 // left gutter for open-string names
const OPEN_W = 30 // open-string note column, left of the nut
const FRET_W = 40
const STRING_GAP = 26
const PAD_Y = 22
const DOT_R = 9

// Frets shown per position box (a hand span). base..base+SPAN inclusive.
const SPAN = 4

const INLAY_FRETS = new Set([3, 5, 7, 9, 15])
const DOUBLE_INLAY = 12

interface Props {
  tuning: number[]
  fretCount: number
  heldNotes: Set<number>
  label: string
  /** Pitch-classes in the current key; lit notes outside it get flagged. */
  keyPcs?: Set<number> | null
  /** When set, faintly mark in-scale positions that aren't currently lit. */
  scaleGuide?: Set<number> | null
  /** Spell note labels as flats to match the detected key. */
  useFlats?: boolean
}

export function FretboardView({
  tuning,
  fretCount,
  heldNotes,
  label,
  keyPcs,
  scaleGuide,
  useFlats = false,
}: Props) {
  const strings = tuning.length
  const nutX = LABEL_W + OPEN_W
  const width = nutX + fretCount * FRET_W + 12
  const height = PAD_Y * 2 + (strings - 1) * STRING_GAP

  // String index 0 (lowest pitch) is drawn at the bottom.
  const stringY = (s: number) => PAD_Y + (strings - 1 - s) * STRING_GAP
  const fretCenterX = (f: number) =>
    f === 0 ? LABEL_W + OPEN_W / 2 : nutX + (f - 0.5) * FRET_W

  // --- Position window: show the chord as one playable box, not scattered. ---
  const [autoMode, setAutoMode] = useState(true)
  const [manualBase, setManualBase] = useState(0)
  const [onePerNote, setOnePerNote] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const maxBase = Math.max(0, fretCount - SPAN)
  const auto = useMemo(
    () => autoAnchor(heldNotes, tuning, fretCount, SPAN),
    [heldNotes, tuning, fretCount],
  )
  // "All" widens the window to the whole neck; otherwise it's a position box.
  const span = showAll ? fretCount : SPAN
  const base = showAll
    ? 0
    : autoMode
      ? auto
      : Math.min(Math.max(0, manualBase), maxBase)

  const litAll = shapeWindowPositions(heldNotes, tuning, fretCount, base, span)
  const lit = onePerNote ? onePerPitchClass(litAll, tuning) : litAll
  const litKeys = new Set(lit.map((p) => `${p.string}-${p.fret}`))

  // In-scale positions within the window that aren't currently played.
  const scaleRaw = scaleGuide
    ? shapeWindowPositions(new Set(scaleGuide), tuning, fretCount, base, span)
    : []
  const scaleDeduped = onePerNote ? onePerPitchClass(scaleRaw, tuning) : scaleRaw
  const scaleDots = scaleDeduped.filter(
    (p) => !litKeys.has(`${p.string}-${p.fret}`),
  )

  const move = (delta: number) => {
    setShowAll(false)
    setAutoMode(false)
    setManualBase(Math.min(maxBase, Math.max(0, base + delta)))
  }

  return (
    <figure className="fretboard">
      <figcaption className="view-title view-title--row">
        <span>{label}</span>
        <span className="fb-pos">
          <button
            type="button"
            className="fb-pos-btn"
            onClick={() => move(-1)}
            disabled={!showAll && base <= 0}
            aria-label="Move position down the neck"
          >
            ◀
          </button>
          <span className="fb-pos-label">
            {showAll ? 'all' : base === 0 ? 'open' : `fr ${base}–${base + SPAN}`}
          </span>
          <button
            type="button"
            className="fb-pos-btn"
            onClick={() => move(1)}
            disabled={!showAll && base >= maxBase}
            aria-label="Move position up the neck"
          >
            ▶
          </button>
          <button
            type="button"
            className={`fb-pos-auto${autoMode && !showAll ? ' fb-pos-auto--on' : ''}`}
            onClick={() => {
              setShowAll(false)
              setAutoMode(true)
            }}
            title="Auto-pick the lowest position covering the whole chord"
          >
            Auto
          </button>
          <button
            type="button"
            className={`fb-pos-auto${showAll ? ' fb-pos-auto--on' : ''}`}
            onClick={() => setShowAll(true)}
            title="Show the chord across the whole neck"
          >
            All
          </button>
          <button
            type="button"
            className={`fb-pos-auto${onePerNote ? ' fb-pos-auto--on' : ''}`}
            onClick={() => setOnePerNote((v) => !v)}
            title={
              onePerNote
                ? 'Showing one dot per note — click for every fretting position in the box'
                : 'Showing every fretting position — click for one dot per note'
            }
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
        {/* Fretboard surface. */}
        <rect
          x={nutX}
          y={PAD_Y}
          width={fretCount * FRET_W}
          height={(strings - 1) * STRING_GAP}
          className="fb-surface"
        />

        {/* Position-window highlight (hidden in "All" mode). */}
        {!showAll &&
          (() => {
            const x1 = base === 0 ? LABEL_W : nutX + base * FRET_W
            const x2 = nutX + Math.min(fretCount, base + SPAN) * FRET_W
            return (
              <rect
                x={x1}
                y={PAD_Y}
                width={x2 - x1}
                height={(strings - 1) * STRING_GAP}
                className="fb-window"
              />
            )
          })()}

        {/* Inlay markers (centered vertically). */}
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

        {/* Fret wires (f=0 is the nut). */}
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

        {/* Fret numbers under the neck. */}
        {Array.from({ length: fretCount }, (_, i) => i + 1)
          .filter((f) => INLAY_FRETS.has(f) || f === DOUBLE_INLAY)
          .map((f) => (
            <text
              key={`num-${f}`}
              x={fretCenterX(f)}
              y={height - 4}
              className="fb-fret-num"
            >
              {f}
            </text>
          ))}

        {/* Strings + open-string labels. */}
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

        {/* Faint scale guide within the position. */}
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

        {/* Lit note positions (the chord shape in this box). */}
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
