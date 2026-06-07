import { ref, type Handle } from 'remix/ui'
import { CLEF_SPLIT, NOTE_NAMES, FLAT_NAMES } from '../music/config.ts'
import { pitchClass, compactVoicing } from '../music/music.ts'
import { pitchColor } from '../music/colors.ts'
import type { ChordHistoryEntry } from './progression-strip.tsx'

const PAD_LEFT = 56
const PAD_RIGHT = 16
const HEIGHT = 224
const TREBLE_Y = 26
const BASS_Y = 110
const PX_PER_BEAT = 40
const MIN_PER_CHORD = 28 // rough width budget per chord for the visible-count cap

// Note values we quantize real durations onto (no dotted/triplets for now).
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

/** Continuous grand staff — note durations/spacing reflect actual play timing. */
export function ProgressionStaff(handle: Handle<Props>) {
  let node: HTMLDivElement | null = null
  let width = 900
  let rafScheduled = false
  let cachedSvg: Node | null = null
  let cachedKey = ''

  function scheduleDraw() {
    if (rafScheduled || typeof requestAnimationFrame === 'undefined') return
    rafScheduled = true
    requestAnimationFrame(() => {
      rafScheduled = false
      draw()
    })
  }

  async function draw() {
    if (!node) return
    const { history, useFlats = false, tempo } = handle.props
    const key =
      history.map((e) => `${(e.pitches ?? []).join(',')}:${e.t ?? 0}`).join('|') +
      `@${tempo ?? 0}#${width}`

    // Cheap path: content unchanged — just re-attach the cached SVG if remix
    // wiped it on reconcile. Only rebuild when notes/timing/width changed.
    if (key === cachedKey && cachedSvg) {
      if (node.firstChild !== cachedSvg) node.replaceChildren(cachedSvg)
      return
    }

    const VF = await import('vexflow')
    const { Renderer, Stave, StaveNote, StaveConnector, Accidental, Voice, Formatter } = VF

    // Render offscreen, swap in atomically (never blank the live node → no flicker).
    const tmp = document.createElement('div')
    const staveW = Math.max(width - 4, 200)
    const usable = staveW - PAD_LEFT - PAD_RIGHT
    const capacity = Math.max(1, Math.floor(usable / MIN_PER_CHORD))
    const visible = history.slice(-capacity)

    const renderer = new Renderer(tmp, Renderer.Backends.SVG)
    renderer.resize(staveW, HEIGHT)
    const ctx = renderer.getContext()

    const treble = new Stave(2, TREBLE_Y, staveW - 4)
    treble.addClef('treble').setContext(ctx).draw()
    const bass = new Stave(2, BASS_Y, staveW - 4)
    bass.addClef('bass').setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw()

    if (visible.length === 0) {
      cachedSvg = tmp.firstChild
      cachedKey = key
      if (cachedSvg) node.replaceChildren(cachedSvg)
      return
    }

    // Real durations: time each chord was held, in beats, quantized to a note value.
    const bpm = tempo && tempo > 0 ? tempo : 120
    const beatMs = 60000 / bpm
    const now = Date.now()
    const durs = visible.map((e, i) => {
      const start = e.t ?? now
      const end = i + 1 < visible.length ? (visible[i + 1].t ?? now) : now
      const ms = Math.max(60, end - start)
      return quantize(ms / beatMs)
    })

    const build = (
      clefPitches: number[],
      restKey: string,
      clef: 'treble' | 'bass',
      code: string,
    ) => {
      if (clefPitches.length === 0) {
        return new StaveNote({ keys: [restKey], duration: `${code}r`, clef })
      }
      const parts = clefPitches.map((p) => toVexKey(p, useFlats))
      const note = new StaveNote({ keys: parts.map((p) => p.key), duration: code, clef })
      parts.forEach((p, i) => {
        if (p.accidental) note.addModifier(new Accidental(p.accidental), i)
        const color = pitchColor(clefPitches[i])
        note.setKeyStyle(i, { fillStyle: color, strokeStyle: color })
      })
      return note
    }

    const voicings = visible.map((e) => compactVoicing(e.pitches ?? []))
    const trebleNotes = voicings.map((v, i) =>
      build(v.filter((p) => p >= CLEF_SPLIT), 'b/4', 'treble', durs[i].code),
    )
    const bassNotes = voicings.map((v, i) =>
      build(v.filter((p) => p < CLEF_SPLIT), 'd/3', 'bass', durs[i].code),
    )

    const totalBeats = durs.reduce((sum, d) => sum + d.beats, 0)
    const tVoice = new Voice({ numBeats: totalBeats, beatValue: 4 }).setMode(Voice.Mode.SOFT)
    tVoice.addTickables(trebleNotes)
    const bVoice = new Voice({ numBeats: totalBeats, beatValue: 4 }).setMode(Voice.Mode.SOFT)
    bVoice.addTickables(bassNotes)
    const formatW = Math.min(usable, Math.max(160, totalBeats * PX_PER_BEAT))
    new Formatter().joinVoices([tVoice, bVoice]).format([tVoice, bVoice], formatW)
    tVoice.draw(ctx, treble)
    bVoice.draw(ctx, bass)

    cachedSvg = tmp.firstChild
    cachedKey = key
    if (cachedSvg) node.replaceChildren(cachedSvg)
  }

  return () => {
    // Always reschedule: remix/ui wipes the imperatively-drawn SVG on each
    // reconcile, so refill after every commit (draw() reuses a cached SVG when
    // the content key is unchanged, so this stays cheap).
    scheduleDraw()
    return (
      <div
        className="progression-staff"
        mix={ref((n, signal) => {
          node = n as HTMLDivElement
          const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width
            // Only redraw on an actual width change — guards a ResizeObserver loop.
            if (w && w > 0 && Math.round(w) !== width) {
              width = Math.round(w)
              draw()
            }
          })
          ro.observe(n)
          signal.addEventListener('abort', () => ro.disconnect())
        })}
      />
    )
  }
}
