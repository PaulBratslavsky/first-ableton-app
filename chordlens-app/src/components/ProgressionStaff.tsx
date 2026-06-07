import { useEffect, useRef, useState } from 'react'
import {
  Renderer,
  Stave,
  StaveNote,
  StaveConnector,
  Accidental,
  TickContext,
} from 'vexflow'
import { CLEF_SPLIT, NOTE_NAMES, FLAT_NAMES } from '../lib/config'
import { pitchClass, compactVoicing } from '../lib/music'
import { pitchColor } from '../lib/colors'
import type { ChordHistoryEntry } from '../hooks/useChordHistory'

// One continuous grand staff. Each chord is placed at a horizontal position
// proportional to WHEN it was played (BPM-based), like a playhead writing notes
// left→right — so the gap between notes reflects the real time between them,
// and the note value reflects how long it was held.
const PAD_RIGHT = 18
const HEIGHT = 224
const TREBLE_Y = 26
const BASS_Y = 110
const PX_PER_BEAT = 56 // horizontal pixels per quarter-note beat

// Note values real durations quantize onto (for the note-head shape).
const STEPS: { beats: number; code: string }[] = [
  { beats: 0.25, code: '16' },
  { beats: 0.5, code: '8' },
  { beats: 1, code: 'q' },
  { beats: 2, code: 'h' },
  { beats: 4, code: 'w' },
]

function quantize(beats: number) {
  const b = Math.min(4, Math.max(0.25, beats))
  let best = STEPS[0]
  let bestDiff = Infinity
  for (const s of STEPS) {
    const diff = Math.abs(Math.log(s.beats) - Math.log(b))
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  return best
}

/** MIDI pitch -> { key: "c#/4", accidental } using scientific octaves. */
function toVexKey(pitch: number, useFlats: boolean) {
  const name = (useFlats ? FLAT_NAMES : NOTE_NAMES)[pitchClass(pitch)]
  const octave = Math.floor(pitch / 12) - 1 // MIDI 60 -> C4
  const letter = name[0].toLowerCase()
  const accidental = name.length > 1 ? (useFlats ? 'b' : '#') : null
  return { key: `${letter}${accidental ?? ''}/${octave}`, accidental }
}

/** One chord (or a rest) of the given note value for a clef. */
function buildNote(
  pitches: number[],
  restKey: string,
  clef: 'treble' | 'bass',
  useFlats: boolean,
  code: string,
): StaveNote {
  if (pitches.length === 0) {
    return new StaveNote({ keys: [restKey], duration: `${code}r`, clef })
  }
  const parts = pitches.map((p) => toVexKey(p, useFlats))
  const note = new StaveNote({ keys: parts.map((p) => p.key), duration: code, clef })
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
  /** Song tempo (BPM) — sets the time→pixels scale; falls back to 120. */
  tempo?: number | null
}

/**
 * The progression on a single grand staff, laid out in real time: each chord
 * sits at x ∝ (its onset time) so the distance between notes is the actual time
 * between when you played them, scaled by the tempo. Newest is anchored at the
 * right (a playhead); older chords scroll off the left.
 */
export function ProgressionStaff({ history, useFlats = false, tempo }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)

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
    const renderer = new Renderer(el, Renderer.Backends.SVG)
    renderer.resize(staveW, HEIGHT)
    const ctx = renderer.getContext()

    const treble = new Stave(2, TREBLE_Y, staveW - 4)
    treble.addClef('treble').setContext(ctx).draw()
    const bass = new Stave(2, BASS_Y, staveW - 4)
    bass.addClef('bass').setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw()

    if (history.length === 0) return

    const bpm = tempo && tempo > 0 ? tempo : 120
    const beatMs = 60000 / bpm
    const now = Date.now()
    const noteStartX = treble.getNoteStartX()
    const rightX = staveW - 4 - PAD_RIGHT

    // Right-anchored playhead: newest chord near the right edge; each chord's x
    // is set by how long *before* the newest it was played.
    const tEnd = history[history.length - 1].t ?? now
    const xAbsOf = (t: number) => rightX - ((tEnd - t) / beatMs) * PX_PER_BEAT
    const visible = history.filter((e) => xAbsOf(e.t ?? now) >= noteStartX)
    if (visible.length === 0) return

    visible.forEach((e) => {
      const idx = history.indexOf(e)
      const start = e.t ?? now
      const end = idx + 1 < history.length ? (history[idx + 1].t ?? now) : now
      const code = quantize(Math.max(60, end - start) / beatMs).code
      const v = compactVoicing(e.pitches ?? [])
      const tNote = buildNote(v.filter((p) => p >= CLEF_SPLIT), 'b/4', 'treble', useFlats, code)
      const bNote = buildNote(v.filter((p) => p < CLEF_SPLIT), 'd/3', 'bass', useFlats, code)

      const tc = new TickContext()
      tc.addTickable(tNote)
      tc.addTickable(bNote)
      tNote.setStave(treble)
      bNote.setStave(bass)
      tNote.setContext(ctx)
      bNote.setContext(ctx)
      tc.preFormat()
      tc.setX(Math.max(0, xAbsOf(start) - noteStartX))
      tNote.draw()
      bNote.draw()
    })
  }, [
    history.map((e) => `${(e.pitches ?? []).join(',')}:${e.t ?? 0}`).join('|'),
    useFlats,
    width,
    tempo,
  ])

  return <div className="progression-staff" ref={ref} />
}
