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

// Continuously-scrolling grand staff driven by a "play clock" that only advances
// while the track is running, so the scroll pauses with the transport (no jump
// on resume). Static clef layer + a notes layer translated each frame by
// elapsed×pixels-per-beat (track BPM).
const PAD_RIGHT = 28
const HEIGHT = 224
const TREBLE_Y = 26
const BASS_Y = 110
const PX_PER_BEAT = 56
const MIN_GAP = 40
const WINDOW_MS = 120_000

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

function toVexKey(pitch: number, useFlats: boolean) {
  const name = (useFlats ? FLAT_NAMES : NOTE_NAMES)[pitchClass(pitch)]
  const octave = Math.floor(pitch / 12) - 1
  const letter = name[0].toLowerCase()
  const accidental = name.length > 1 ? (useFlats ? 'b' : '#') : null
  return { key: `${letter}${accidental ?? ''}/${octave}`, accidental }
}

interface Props {
  history: ChordHistoryEntry[]
  useFlats?: boolean
  tempo?: number | null
  /** Whether the timeline should advance (Ableton playing / demo / MIDI input). */
  running?: boolean
}

export function ProgressionStaff({ history, useFlats = false, tempo, running = true }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const noteStartX = useRef(56)
  const rightEdge = useRef(800)
  const playMs = useRef(0)
  const lastWall = useRef<number | null>(null)
  const originStamp = useRef<number | null>(null)
  const stamps = useRef(new Map<string, number>())
  const tempoRef = useRef(tempo)
  tempoRef.current = tempo
  const runningRef = useRef(running)
  runningRef.current = running

  const ppm = () => {
    const bpm = tempoRef.current && tempoRef.current > 0 ? tempoRef.current : 120
    return PX_PER_BEAT / (60000 / bpm)
  }
  const advanceClock = () => {
    const wall = Date.now()
    if (lastWall.current != null && runningRef.current) playMs.current += wall - lastWall.current
    lastWall.current = wall
  }
  const scrollX = () =>
    originStamp.current == null
      ? rightEdge.current - noteStartX.current
      : rightEdge.current - noteStartX.current - (playMs.current - originStamp.current) * ppm()

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
    const staveW = Math.max(width - 4, 200)

    const divA = document.createElement('div')
    const rA = new Renderer(divA, Renderer.Backends.SVG)
    rA.resize(staveW, HEIGHT)
    const ctxA = rA.getContext()
    const tA = new Stave(2, TREBLE_Y, staveW - 4)
    tA.addClef('treble').setContext(ctxA).draw()
    const bA = new Stave(2, BASS_Y, staveW - 4)
    bA.addClef('bass').setContext(ctxA).draw()
    new StaveConnector(tA, bA).setType(StaveConnector.type.BRACE).setContext(ctxA).draw()
    new StaveConnector(tA, bA).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctxA).draw()
    const svgA = divA.innerHTML

    const divB = document.createElement('div')
    const rB = new Renderer(divB, Renderer.Backends.SVG)
    rB.resize(staveW, HEIGHT)
    const ctxB = rB.getContext()
    const tB = new Stave(2, TREBLE_Y, staveW - 4).setContext(ctxB)
    const bB = new Stave(2, BASS_Y, staveW - 4).setContext(ctxB)
    noteStartX.current = tB.getNoteStartX()
    rightEdge.current = staveW - 4 - PAD_RIGHT

    const bpm = tempo && tempo > 0 ? tempo : 120
    const beatMs = 60000 / bpm
    const now = Date.now()
    advanceClock()
    const recent = history.filter((e) => now - (e.t ?? now) < WINDOW_MS)

    const buildNote = (
      pitches: number[],
      restKey: string,
      clef: 'treble' | 'bass',
      code: string,
    ) => {
      if (pitches.length === 0) return new StaveNote({ keys: [restKey], duration: `${code}r`, clef })
      const parts = pitches.map((p) => toVexKey(p, useFlats))
      const note = new StaveNote({ keys: parts.map((p) => p.key), duration: code, clef })
      parts.forEach((p, i) => {
        if (p.accidental) note.addModifier(new Accidental(p.accidental), i)
        const color = pitchColor(pitches[i])
        note.setKeyStyle(i, { fillStyle: color, strokeStyle: color })
      })
      return note
    }

    let lastX = -Infinity
    recent.forEach((e) => {
      const idx = history.indexOf(e)
      const start = e.t ?? now
      const end = idx + 1 < history.length ? (history[idx + 1].t ?? now) : now
      const code = quantize(Math.max(60, end - start) / beatMs).code
      const k = `${(e.pitches ?? []).join(',')}:${e.t ?? 0}`
      if (!stamps.current.has(k)) stamps.current.set(k, playMs.current)
      const stamp = stamps.current.get(k)!
      if (originStamp.current == null) originStamp.current = stamp
      const timeX = (stamp - originStamp.current) * ppm()
      const x = Math.max(timeX, lastX + MIN_GAP)
      lastX = x

      const v = compactVoicing(e.pitches ?? [])
      const tNote = buildNote(v.filter((p) => p >= CLEF_SPLIT), 'b/4', 'treble', code)
      const bNote = buildNote(v.filter((p) => p < CLEF_SPLIT), 'd/3', 'bass', code)
      const tc = new TickContext()
      tc.addTickable(tNote)
      tc.addTickable(bNote)
      tNote.setStave(tB)
      bNote.setStave(bB)
      tNote.setContext(ctxB)
      bNote.setContext(ctxB)
      tc.preFormat()
      tc.setX(x)
      tNote.draw()
      bNote.draw()
    })
    const svgB = divB.innerHTML

    el.innerHTML =
      `<div class="staff-layers">${svgA}` +
      `<div class="staff-notes" data-notes style="transform:translateX(${scrollX()}px)">${svgB}</div>` +
      `</div>`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.map((e) => `${(e.pitches ?? []).join(',')}:${e.t ?? 0}`).join('|'), useFlats, width, tempo])

  useEffect(() => {
    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      advanceClock()
      const el = ref.current
      if (!el) return
      const n = el.querySelector('[data-notes]') as HTMLElement | null
      if (n) n.style.transform = `translateX(${scrollX()}px)`
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="progression-staff" ref={ref} />
}
