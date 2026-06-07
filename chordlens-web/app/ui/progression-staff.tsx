import { ref, type Handle } from 'remix/ui'
import { CLEF_SPLIT, NOTE_NAMES, FLAT_NAMES } from '../music/config.ts'
import { pitchClass, compactVoicing } from '../music/music.ts'
import { pitchColor } from '../music/colors.ts'
import type { ChordHistoryEntry } from './progression-strip.tsx'

const PER_CHORD = 64
const PAD_LEFT = 56
const PAD_RIGHT = 16
const HEIGHT = 224
const TREBLE_Y = 26
const BASS_Y = 110

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
}

/** Remix 3 port of ProgressionStaff — one continuous grand staff. */
export function ProgressionStaff(handle: Handle<Props>) {
  let node: HTMLDivElement | null = null
  let width = 900
  let lastKey = ''

  async function draw() {
    if (!node) return
    const { history, useFlats = false } = handle.props
    const VF = await import('vexflow')
    const { Renderer, Stave, StaveNote, StaveConnector, Accidental, Voice, Formatter } = VF

    node.innerHTML = ''
    const staveW = Math.max(width - 4, 200)
    const usable = staveW - PAD_LEFT - PAD_RIGHT
    const capacity = Math.max(1, Math.floor(usable / PER_CHORD))
    const visible = history.slice(-capacity)

    const renderer = new Renderer(node, Renderer.Backends.SVG)
    renderer.resize(staveW, HEIGHT)
    const ctx = renderer.getContext()

    const treble = new Stave(2, TREBLE_Y, staveW - 4)
    treble.addClef('treble').setContext(ctx).draw()
    const bass = new Stave(2, BASS_Y, staveW - 4)
    bass.addClef('bass').setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw()

    if (visible.length === 0) return

    const build = (clefPitches: number[], restKey: string, clef: 'treble' | 'bass') => {
      if (clefPitches.length === 0) {
        return new StaveNote({ keys: [restKey], duration: 'wr', clef })
      }
      const parts = clefPitches.map((p) => toVexKey(p, useFlats))
      const note = new StaveNote({ keys: parts.map((p) => p.key), duration: 'w', clef })
      parts.forEach((p, i) => {
        if (p.accidental) note.addModifier(new Accidental(p.accidental), i)
        const color = pitchColor(clefPitches[i])
        note.setKeyStyle(i, { fillStyle: color, strokeStyle: color })
      })
      return note
    }

    const n = visible.length
    const voicings = visible.map((e) => compactVoicing(e.pitches ?? []))
    const trebleNotes = voicings.map((v) => build(v.filter((p) => p >= CLEF_SPLIT), 'b/4', 'treble'))
    const bassNotes = voicings.map((v) => build(v.filter((p) => p < CLEF_SPLIT), 'd/3', 'bass'))

    const tVoice = new Voice({ numBeats: n * 4, beatValue: 4 }).setMode(Voice.Mode.SOFT)
    tVoice.addTickables(trebleNotes)
    const bVoice = new Voice({ numBeats: n * 4, beatValue: 4 }).setMode(Voice.Mode.SOFT)
    bVoice.addTickables(bassNotes)
    const formatW = Math.min(usable, n * PER_CHORD)
    new Formatter().joinVoices([tVoice, bVoice]).format([tVoice, bVoice], formatW)
    tVoice.draw(ctx, treble)
    bVoice.draw(ctx, bass)
  }

  return () => {
    const { history } = handle.props
    const key = history.map((e) => (e.pitches ?? []).join(',')).join('|')
    if (key !== lastKey) {
      lastKey = key
      handle.queueTask(() => draw())
    }
    return (
      <div
        className="progression-staff"
        mix={ref((n, signal) => {
          node = n as HTMLDivElement
          const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width
            if (w && w > 0) {
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
