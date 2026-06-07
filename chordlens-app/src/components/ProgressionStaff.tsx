import { useEffect, useRef, useState } from 'react'
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
import { pitchClass, compactVoicing } from '../lib/music'
import { pitchColor } from '../lib/colors'
import type { ChordHistoryEntry } from '../hooks/useChordHistory'

// One continuous grand staff: one whole-note chord per column, left to right.
// The clef stays fixed at the left; the most recent chords that fit are shown,
// so new chords slide in from the right.
const PER_CHORD = 64 // horizontal space per chord column
const PAD_LEFT = 56 // clef + brace room
const PAD_RIGHT = 16
const HEIGHT = 224
const TREBLE_Y = 26
const BASS_Y = 110

/** MIDI pitch -> { key: "c#/4", accidental } using scientific octaves. */
function toVexKey(pitch: number, useFlats: boolean) {
  const name = (useFlats ? FLAT_NAMES : NOTE_NAMES)[pitchClass(pitch)]
  const octave = Math.floor(pitch / 12) - 1 // MIDI 60 -> C4
  const letter = name[0].toLowerCase()
  const accidental = name.length > 1 ? (useFlats ? 'b' : '#') : null
  return { key: `${letter}${accidental ?? ''}/${octave}`, accidental }
}

/** One whole-note chord (or a whole rest) for a clef. */
function buildNote(
  pitches: number[],
  restKey: string,
  clef: 'treble' | 'bass',
  useFlats: boolean,
): StaveNote {
  if (pitches.length === 0) {
    return new StaveNote({ keys: [restKey], duration: 'wr', clef })
  }
  const parts = pitches.map((p) => toVexKey(p, useFlats))
  const note = new StaveNote({ keys: parts.map((p) => p.key), duration: 'w', clef })
  parts.forEach((p, i) => {
    if (p.accidental) note.addModifier(new Accidental(p.accidental), i)
    const color = pitchColor(pitches[i])
    note.setKeyStyle(i, { fillStyle: color, strokeStyle: color })
  })
  return note
}

interface Props {
  history: ChordHistoryEntry[]
  useFlats?: boolean
}

/**
 * The progression on a single grand staff — each recorded chord is one
 * whole-note column, oldest → newest, reading like a lead sheet. The clef is
 * always visible; only the most recent chords that fit the panel are shown.
 * Notes split across treble/bass by CLEF_SPLIT and are colored by pitch-class.
 */
export function ProgressionStaff({ history, useFlats = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)

  // Track the panel width so we can fit the most recent chords without scroll.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = '' // VexFlow appends; clear before each re-render.

    const staveW = Math.max(width - 4, 200)
    const usable = staveW - PAD_LEFT - PAD_RIGHT
    const capacity = Math.max(1, Math.floor(usable / PER_CHORD))
    const visible = history.slice(-capacity)

    const renderer = new Renderer(el, Renderer.Backends.SVG)
    renderer.resize(staveW, HEIGHT)
    const ctx = renderer.getContext()

    const treble = new Stave(2, TREBLE_Y, staveW - 4)
    treble.addClef('treble').setContext(ctx).draw()
    const bass = new Stave(2, BASS_Y, staveW - 4)
    bass.addClef('bass').setContext(ctx).draw()

    new StaveConnector(treble, bass)
      .setType(StaveConnector.type.BRACE)
      .setContext(ctx)
      .draw()
    new StaveConnector(treble, bass)
      .setType(StaveConnector.type.SINGLE_LEFT)
      .setContext(ctx)
      .draw()

    if (visible.length === 0) return

    const n = visible.length
    const voicings = visible.map((e) => compactVoicing(e.pitches ?? []))
    const trebleNotes = voicings.map((v) =>
      buildNote(v.filter((p) => p >= CLEF_SPLIT), 'b/4', 'treble', useFlats),
    )
    const bassNotes = voicings.map((v) =>
      buildNote(v.filter((p) => p < CLEF_SPLIT), 'd/3', 'bass', useFlats),
    )

    const tVoice = new Voice({ numBeats: n * 4, beatValue: 4 }).setMode(Voice.Mode.SOFT)
    tVoice.addTickables(trebleNotes)
    const bVoice = new Voice({ numBeats: n * 4, beatValue: 4 }).setMode(Voice.Mode.SOFT)
    bVoice.addTickables(bassNotes)

    // Pack chords from the left at a fixed spacing (don't stretch across the
    // whole staff when there are only a few).
    const formatW = Math.min(usable, n * PER_CHORD)
    new Formatter().joinVoices([tVoice, bVoice]).format([tVoice, bVoice], formatW)
    tVoice.draw(ctx, treble)
    bVoice.draw(ctx, bass)
  }, [history.map((e) => (e.pitches ?? []).join(',')).join('|'), useFlats, width])

  return <div className="progression-staff" ref={ref} />
}
