import { useEffect, useRef } from 'react'
import {
  Renderer,
  Stave,
  StaveNote,
  StaveConnector,
  Accidental,
  Voice,
  Formatter,
} from 'vexflow'
import { CLEF_SPLIT, NOTE_NAMES, FLAT_NAMES } from '../lib/config'
import { detectChord, pitchClass, compactVoicing } from '../lib/music'
import { pitchColor } from '../lib/colors'

const WIDTH = 360
const HEIGHT = 280
const STAVE_X = 20
const STAVE_W = 300
const TREBLE_Y = 40
const BASS_Y = 150

/** MIDI pitch -> { key: "c#/4", accidental } using scientific octaves; flats optional. */
function toVexKey(
  pitch: number,
  useFlats: boolean,
): { key: string; accidental: string | null } {
  const name = (useFlats ? FLAT_NAMES : NOTE_NAMES)[pitchClass(pitch)] // e.g. "Db"
  const octave = Math.floor(pitch / 12) - 1 // MIDI 60 -> C4 (middle C)
  const letter = name[0].toLowerCase()
  const accidental = name.length > 1 ? (useFlats ? 'b' : '#') : null
  return { key: `${letter}${accidental ?? ''}/${octave}`, accidental }
}

/** Build one whole-note chord (or a whole rest) for a clef's pitches. */
function buildNote(pitches: number[], restKey: string, useFlats: boolean): StaveNote {
  if (pitches.length === 0) {
    return new StaveNote({ keys: [restKey], duration: 'wr' })
  }
  const parts = pitches.map((p) => toVexKey(p, useFlats))
  const note = new StaveNote({ keys: parts.map((p) => p.key), duration: 'w' })
  parts.forEach((p, i) => {
    if (p.accidental) note.addModifier(new Accidental(p.accidental), i)
    // Color each notehead by its pitch-class, matching the other views.
    const color = pitchColor(pitches[i])
    note.setKeyStyle(i, { fillStyle: color, strokeStyle: color })
  })
  return note
}

function drawClef(
  context: ReturnType<Renderer['getContext']>,
  y: number,
  clef: 'treble' | 'bass',
  pitches: number[],
  restKey: string,
  useFlats: boolean,
): Stave {
  const stave = new Stave(STAVE_X, y, STAVE_W)
  stave.addClef(clef).setContext(context).draw()

  const note = buildNote(pitches, restKey, useFlats)
  const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT)
  voice.addTickables([note])
  new Formatter().joinVoices([voice]).format([voice], STAVE_W - 60)
  voice.draw(context, stave)
  return stave
}

interface Props {
  heldNotes: Set<number>
  /** Spell accidentals as flats to match the detected key. */
  useFlats?: boolean
}

export function NotationView({ heldNotes, useFlats = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const pitches = [...heldNotes].sort((a, b) => a - b)
  const chord = detectChord(pitches, useFlats)
  const chordSymbol = chord?.chordSymbol ?? null

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.innerHTML = '' // VexFlow appends; clear before each re-render.

    const renderer = new Renderer(el, Renderer.Backends.SVG)
    renderer.resize(WIDTH, HEIGHT)
    const context = renderer.getContext()

    // Use the same compact voicing as the progression sheet, so the current
    // chord here matches its column there.
    const voiced = compactVoicing(pitches)
    const treblePitches = voiced.filter((p) => p >= CLEF_SPLIT)
    const bassPitches = voiced.filter((p) => p < CLEF_SPLIT)

    const treble = drawClef(context, TREBLE_Y, 'treble', treblePitches, 'b/4', useFlats)
    const bass = drawClef(context, BASS_Y, 'bass', bassPitches, 'd/3', useFlats)

    // Brace + connecting lines to make it a grand staff.
    new StaveConnector(treble, bass)
      .setType(StaveConnector.type.BRACE)
      .setContext(context)
      .draw()
    new StaveConnector(treble, bass)
      .setType(StaveConnector.type.SINGLE_LEFT)
      .setContext(context)
      .draw()
    new StaveConnector(treble, bass)
      .setType(StaveConnector.type.SINGLE_RIGHT)
      .setContext(context)
      .draw()
  }, [pitches.join(','), useFlats])

  return (
    <figure className="notation">
      <figcaption className="view-title">
        Notation
        <span className="chord-symbol">{chordSymbol ?? '—'}</span>
      </figcaption>
      <div className="notation-canvas" ref={containerRef} />
    </figure>
  )
}
