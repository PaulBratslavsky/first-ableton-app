import { useEffect, useMemo, useState } from 'react'
import {
  shapeWindowPositions,
  autoAnchor,
  onePerPitchClass,
  noteName,
  pitchClass,
} from '../lib/music'
import { voicingsFor, MUTED, type Voicing } from '../lib/voicings'
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

/**
 * Chord shapes drawn at once. Three positions is what a guitarist wants in
 * front of them — the one at the nut, and the two nearest grips up the neck —
 * so you can reach for whichever your hand is closest to instead of flipping.
 */
const VISIBLE_SHAPES = 3

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
  /**
   * Detected chord symbol. Supplying it offers "Chord" mode, which replaces the
   * note-location dots with ranked, playable shapes. Omit to leave the view as
   * a pure note map (the bass has no use for chord grips).
   */
  chordSymbol?: string | null
  /**
   * Name every position on the neck, not just the lit ones. Always spelled
   * with sharps — the overlay is a fixed map of the neck, not a reading of the
   * current key.
   */
  showNames?: boolean
  onToggleNames?: () => void
}

export function FretboardView({
  tuning,
  fretCount,
  heldNotes,
  label,
  keyPcs,
  scaleGuide,
  useFlats = false,
  chordSymbol,
  showNames = false,
  onToggleNames,
}: Props) {
  const strings = tuning.length
  const nutX = LABEL_W + OPEN_W
  const width = nutX + fretCount * FRET_W + 12
  const height = PAD_Y * 2 + (strings - 1) * STRING_GAP

  // String index 0 (lowest pitch) is drawn at the bottom.
  const stringY = (s: number) => PAD_Y + (strings - 1 - s) * STRING_GAP
  const fretCenterX = (f: number) =>
    f === 0 ? LABEL_W + OPEN_W / 2 : nutX + (f - 0.5) * FRET_W

  // --- Chord mode: ranked shapes you can actually grab. ---
  const offersChords = chordSymbol !== undefined
  const [chordOn, setChordOn] = useState(false)
  const [shapeOffset, setShapeOffset] = useState(0)
  const shapes = useMemo(
    () => (chordSymbol ? voicingsFor(chordSymbol, tuning, fretCount) : []),
    [chordSymbol, tuning, fretCount],
  )
  // A new chord starts you back at the nut.
  useEffect(() => setShapeOffset(0), [chordSymbol])
  const chordActive = chordOn && shapes.length > 0
  const maxOffset = Math.max(0, shapes.length - VISIBLE_SHAPES)
  const offset = Math.min(shapeOffset, maxOffset)
  const visibleShapes = chordActive
    ? shapes.slice(offset, offset + VISIBLE_SHAPES)
    : []

  /** Open grips are played at the nut whatever fret they happen to stop. */
  const isOpenShape = (v: Voicing) => v.frets.includes(0)
  const shapeName = (v: Voicing) => (isOpenShape(v) ? 'open' : `fr ${v.position}`)

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

  // The arrows slide the trio of shapes along the neck in chord mode, and the
  // position window otherwise.
  const move = (delta: number) => {
    if (chordActive) {
      setShapeOffset(Math.min(maxOffset, Math.max(0, offset + delta)))
      return
    }
    setShowAll(false)
    setAutoMode(false)
    setManualBase(Math.min(maxBase, Math.max(0, base + delta)))
  }

  const atStart = chordActive ? offset <= 0 : !showAll && base <= 0
  const atEnd = chordActive ? offset >= maxOffset : !showAll && base >= maxBase

  /**
   * Horizontal extent of a shape's box: the fret cells its stopped notes
   * occupy, reaching back to the nut whenever it rings an open string.
   */
  const shapeBox = (v: Voicing) => {
    const fretted = v.frets.filter((f) => f > 0)
    const hi = fretted.length ? Math.max(...fretted) : 0
    return {
      x1: isOpenShape(v) ? LABEL_W : nutX + (v.position - 1) * FRET_W,
      x2: hi === 0 ? nutX : nutX + hi * FRET_W,
    }
  }

  const positionLabel = chordActive
    ? visibleShapes.map(shapeName).join(' · ')
    : showAll
      ? 'all'
      : base === 0
        ? 'open'
        : `fr ${base}–${base + SPAN}`

  return (
    <figure className="fretboard">
      <figcaption className="view-title view-title--row">
        <span>
          {label}
          {chordActive && chordSymbol && (
            <span className="fb-chord-name">{chordSymbol}</span>
          )}
        </span>
        <span className="fb-pos">
          <button
            type="button"
            className="fb-pos-btn"
            onClick={() => move(-1)}
            disabled={atStart}
            aria-label={
              chordActive ? 'Previous shapes' : 'Move position down the neck'
            }
          >
            ◀
          </button>
          <span className="fb-pos-label">{positionLabel}</span>
          <button
            type="button"
            className="fb-pos-btn"
            onClick={() => move(1)}
            disabled={atEnd}
            aria-label={chordActive ? 'Next shapes' : 'Move position up the neck'}
          >
            ▶
          </button>
          {offersChords && (
            <button
              type="button"
              className={`fb-pos-auto${chordActive ? ' fb-pos-auto--on' : ''}`}
              onClick={() => setChordOn((v) => !v)}
              disabled={shapes.length === 0}
              title={
                shapes.length === 0
                  ? 'Play a recognisable chord to see shapes for it'
                  : 'Show playable chord shapes instead of every matching note'
              }
            >
              Chord
            </button>
          )}
          <button
            type="button"
            className={`fb-pos-auto${autoMode && !showAll && !chordActive ? ' fb-pos-auto--on' : ''}`}
            onClick={() => {
              setChordOn(false)
              setShowAll(false)
              setAutoMode(true)
            }}
            title="Auto-pick the lowest position covering the whole chord"
          >
            Auto
          </button>
          <button
            type="button"
            className={`fb-pos-auto${showAll && !chordActive ? ' fb-pos-auto--on' : ''}`}
            onClick={() => {
              setChordOn(false)
              setShowAll(true)
            }}
            title="Show the chord across the whole neck"
          >
            All
          </button>
          <button
            type="button"
            className={`fb-pos-auto${onePerNote && !chordActive ? ' fb-pos-auto--on' : ''}`}
            onClick={() => setOnePerNote((v) => !v)}
            disabled={chordActive}
            title={
              onePerNote
                ? 'Showing one dot per note — click for every fretting position in the box'
                : 'Showing every fretting position — click for one dot per note'
            }
          >
            1×
          </button>
          {onToggleNames && (
            <button
              type="button"
              className={`fb-pos-auto${showNames ? ' fb-pos-auto--on' : ''}`}
              onClick={onToggleNames}
              title="Name every note on the neck"
            >
              Names
            </button>
          )}
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

        {/* Position-window highlight (hidden in "All" and chord modes). */}
        {!chordActive &&
          !showAll &&
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

        {/* One labelled box per chord shape. Grips at neighbouring positions
            overlap on the neck, so they're outlined and named rather than
            filled — three tinted blocks would merge into one. */}
        {visibleShapes.map((v, i) => {
          const box = shapeBox(v)
          return (
            <g key={`box-${v.frets.join(',')}`} className={`fb-shape fb-shape--${i}`}>
              <rect
                x={box.x1}
                y={PAD_Y - 7}
                width={box.x2 - box.x1}
                height={(strings - 1) * STRING_GAP + 14}
                rx={7}
                className="fb-shape-box"
              />
              <text x={box.x1 + 5} y={PAD_Y - 11} className="fb-shape-label">
                {shapeName(v)}
              </text>
            </g>
          )
        })}

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

        {/* Barre bars, drawn under the dots so the note labels stay on top. */}
        {visibleShapes.map(
          (v) =>
            v.barre && (
              <rect
                key={`barre-${v.frets.join(',')}`}
                x={fretCenterX(v.barre.fret) - DOT_R}
                y={stringY(v.barre.to) - DOT_R}
                width={DOT_R * 2}
                height={stringY(v.barre.from) - stringY(v.barre.to) + DOT_R * 2}
                rx={DOT_R}
                className="fb-barre"
              />
            ),
        )}

        {/* Every note on the neck, named. Drawn under the dots so a lit note
            keeps its own label. */}
        {showNames &&
          tuning.flatMap((open, string) =>
            Array.from({ length: fretCount + 1 }, (_, fret) => {
              // The scale guide's dots would sit behind these labels, so the
              // key is carried by the lettering instead.
              const inKey = scaleGuide?.has(pitchClass(open + fret)) ?? false
              return (
                <text
                  key={`name-${string}-${fret}`}
                  x={fretCenterX(fret)}
                  y={stringY(string)}
                  className={`fb-name${inKey ? ' fb-name--in-key' : ''}`}
                >
                  {noteName(open + fret).replace(/[0-9]/g, '')}
                </text>
              )
            }),
          )}

        {/* Faint scale guide within the position (noise next to a chord shape). */}
        {!chordActive && !showNames && scaleDots.map(({ string, fret }) => (
          <circle
            key={`scale-${string}-${fret}`}
            cx={fretCenterX(fret)}
            cy={stringY(string)}
            r={3.2}
            className="fb-scale-dot"
            style={{ fill: pitchColor(tuning[string] + fret) }}
          />
        ))}

        {/* Strings each shape doesn't play, marked at that shape's own box. */}
        {visibleShapes.flatMap((v) => {
          const key = v.frets.join(',')
          const x = isOpenShape(v) ? fretCenterX(0) : shapeBox(v).x1 - 9
          return v.frets.flatMap((fret, string) =>
            fret === MUTED
              ? [
                  <text
                    key={`mute-${key}-${string}`}
                    x={x}
                    y={stringY(string)}
                    className="fb-mute"
                  >
                    ×
                  </text>,
                ]
              : [],
          )
        })}

        {/* Chord-shape dots — every visible shape at once. */}
        {visibleShapes.flatMap((v) =>
          v.frets.flatMap((fret, string) => {
            if (fret === MUTED) return []
            const pitch = tuning[string] + fret
            const color = pitchColor(pitch)
            return [
              <g key={`shape-${v.frets.join(',')}-${string}`}>
                <circle
                  cx={fretCenterX(fret)}
                  cy={stringY(string)}
                  r={DOT_R}
                  className="fb-note"
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
              </g>,
            ]
          }),
        )}

        {/* Note-location dots (the default view). */}
        {!chordActive && lit.map(({ string, fret }) => {
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
