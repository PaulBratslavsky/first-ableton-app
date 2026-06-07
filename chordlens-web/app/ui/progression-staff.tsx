import { ref, type Handle } from 'remix/ui'
import { CLEF_SPLIT, NOTE_NAMES, FLAT_NAMES } from '../music/config.ts'
import { pitchClass, compactVoicing } from '../music/music.ts'
import { pitchColor } from '../music/colors.ts'
import type { ChordHistoryEntry } from './progression-strip.tsx'

// One continuous grand staff. Each chord sits at x ∝ when it was played
// (BPM-based) — a playhead writing notes left→right — so the gap between notes
// is the real time between them. Rendered to an SVG string and applied via the
// `innerHTML` prop so remix/ui never wipes it (no flicker / layout shift).
const PAD_RIGHT = 18
const HEIGHT = 224
const TREBLE_Y = 26
const BASS_Y = 110
const PX_PER_BEAT = 56

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
}

export function ProgressionStaff(handle: Handle<Props>) {
  let width = 900
  let cachedKey = ''
  let cachedSvg = ''
  let building = false

  async function rebuild(key: string) {
    const VF = await import('vexflow')
    const { Renderer, Stave, StaveNote, StaveConnector, Accidental, TickContext } = VF
    const { history, useFlats = false, tempo } = handle.props

    const div = document.createElement('div')
    const staveW = Math.max(width - 4, 200)
    const renderer = new Renderer(div, Renderer.Backends.SVG)
    renderer.resize(staveW, HEIGHT)
    const ctx = renderer.getContext()

    const treble = new Stave(2, TREBLE_Y, staveW - 4)
    treble.addClef('treble').setContext(ctx).draw()
    const bass = new Stave(2, BASS_Y, staveW - 4)
    bass.addClef('bass').setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw()

    const buildNote = (pitches: number[], restKey: string, clef: 'treble' | 'bass', code: string) => {
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

    if (history.length > 0) {
      const bpm = tempo && tempo > 0 ? tempo : 120
      const beatMs = 60000 / bpm
      const now = Date.now()
      const noteStartX = treble.getNoteStartX()
      const rightX = staveW - 4 - PAD_RIGHT
      const tEnd = history[history.length - 1].t ?? now
      const xAbsOf = (t: number) => rightX - ((tEnd - t) / beatMs) * PX_PER_BEAT
      const visible = history.filter((e) => xAbsOf(e.t ?? now) >= noteStartX)

      visible.forEach((e) => {
        const idx = history.indexOf(e)
        const start = e.t ?? now
        const end = idx + 1 < history.length ? (history[idx + 1].t ?? now) : now
        const code = quantize(Math.max(60, end - start) / beatMs).code
        const v = compactVoicing(e.pitches ?? [])
        const tNote = buildNote(v.filter((p) => p >= CLEF_SPLIT), 'b/4', 'treble', code)
        const bNote = buildNote(v.filter((p) => p < CLEF_SPLIT), 'd/3', 'bass', code)
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
    }

    cachedSvg = div.innerHTML
    cachedKey = key
    handle.update()
  }

  return () => {
    const { history, tempo } = handle.props
    const key =
      history.map((e) => `${(e.pitches ?? []).join(',')}:${e.t ?? 0}`).join('|') +
      `@${tempo ?? 0}#${width}`
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
          const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width
            if (w && w > 0 && Math.round(w) !== width) {
              width = Math.round(w)
              handle.update()
            }
          })
          ro.observe(n)
          signal.addEventListener('abort', () => ro.disconnect())
        })}
      />
    )
  }
}
