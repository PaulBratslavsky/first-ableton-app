import { ref, type Handle } from 'remix/ui'
import { CLEF_SPLIT, NOTE_NAMES, FLAT_NAMES } from '../music/config.ts'
import { pitchClass, compactVoicing } from '../music/music.ts'
import { pitchColor } from '../music/colors.ts'
import type { ChordHistoryEntry } from './progression-strip.tsx'

// Continuously-scrolling grand staff driven by a "play clock" that only advances
// while the track is running (Ableton playing / Demo / Web MIDI). Each chord is
// stamped with that clock when first seen, so pausing freezes the scroll with no
// jump on resume. A static clef layer sits behind a notes layer that a
// requestAnimationFrame loop translates by elapsed×pixels-per-beat (track BPM).
const PAD_RIGHT = 28
const HEIGHT = 224
const TREBLE_Y = 26
const BASS_Y = 110
const PX_PER_BEAT = 56
const MIN_GAP = 40 // minimum px between consecutive chords so they never overlap
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
  /** Whether the timeline should advance (Ableton playing / Demo / Web MIDI). */
  running?: boolean
}

export function ProgressionStaff(handle: Handle<Props>) {
  let node: HTMLDivElement | null = null
  let width = 900
  let cachedKey = ''
  let cachedSvg = ''
  let building = false
  let raf: number | null = null

  let noteStartX = 56
  let rightEdge = 800

  // Play clock: advances only while `running`, so the scroll pauses with the
  // transport. Notes are stamped with it on first sight.
  let playMs = 0
  let lastWall: number | null = null
  let originStamp: number | null = null
  let runningFlag = true // mirrors handle.props.running, refreshed each render
  const stamps = new Map<string, number>()

  function ppm() {
    const { tempo } = handle.props
    const bpm = tempo && tempo > 0 ? tempo : 120
    return PX_PER_BEAT / (60000 / bpm)
  }

  function advanceClock() {
    const wall = Date.now()
    if (lastWall != null && runningFlag) playMs += wall - lastWall
    lastWall = wall
  }

  function scrollX() {
    if (originStamp == null) return rightEdge - noteStartX
    return rightEdge - noteStartX - (playMs - originStamp) * ppm()
  }

  function animate() {
    raf = requestAnimationFrame(animate)
    advanceClock()
    if (!node) return
    const notes = node.querySelector('[data-notes]') as HTMLElement | null
    if (notes) notes.style.transform = `translateX(${scrollX()}px)`
  }

  async function rebuild(key: string) {
    const VF = await import('vexflow')
    const { Renderer, Stave, StaveNote, StaveConnector, Accidental, TickContext } = VF
    const { history, useFlats = false, tempo } = handle.props
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
    noteStartX = tB.getNoteStartX()
    rightEdge = staveW - 4 - PAD_RIGHT

    const bpm = tempo && tempo > 0 ? tempo : 120
    const beatMs = 60000 / bpm
    const now = Date.now()
    advanceClock() // make sure playMs is current before stamping
    const recent = history.filter((e) => now - (e.t ?? now) < WINDOW_MS)

    const buildNote = (pitches: number[], restKey: string, clef: 'treble' | 'bass', code: string) => {
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
      if (!stamps.has(k)) stamps.set(k, playMs)
      const stamp = stamps.get(k)!
      if (originStamp == null) originStamp = stamp
      const timeX = (stamp - originStamp) * ppm()
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

    cachedSvg =
      `<div class="staff-layers">${svgA}` +
      `<div class="staff-notes" data-notes style="transform:translateX(${scrollX()}px)">${svgB}</div>` +
      `</div>`
    cachedKey = key
    handle.update()
  }

  return () => {
    const { history, tempo, running } = handle.props
    runningFlag = running !== false // keep the rAF clock gate in sync with props
    const key =
      history.map((e) => `${(e.pitches ?? []).join(',')}:${e.t ?? 0}`).join('|') +
      `@${tempo ?? 0}#${width}!${running ? 1 : 0}`
    if (key !== cachedKey && typeof document !== 'undefined' && !building) {
      building = true
      rebuild(key)
        .catch(() => {})
        .finally(() => {
          building = false
        })
    }
    return (
      <div
        className="progression-staff"
        innerHTML={cachedSvg}
        mix={ref((n, signal) => {
          node = n as HTMLDivElement
          const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width
            if (w && w > 0 && Math.round(w) !== width) {
              width = Math.round(w)
              handle.update()
            }
          })
          ro.observe(n)
          if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(animate)
          signal.addEventListener('abort', () => {
            ro.disconnect()
            if (raf != null) cancelAnimationFrame(raf)
          })
        })}
      />
    )
  }
}
