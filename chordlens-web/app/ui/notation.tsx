import { ref, type Handle } from 'remix/ui'
import { CLEF_SPLIT, NOTE_NAMES, FLAT_NAMES } from '../music/config.ts'
import { detectChord, pitchClass, compactVoicing } from '../music/music.ts'
import { pitchColor } from '../music/colors.ts'

const WIDTH = 360
const HEIGHT = 280
const STAVE_X = 20
const STAVE_W = 300
const TREBLE_Y = 40
const BASS_Y = 150

function toVexKey(pitch: number, useFlats: boolean) {
  const name = (useFlats ? FLAT_NAMES : NOTE_NAMES)[pitchClass(pitch)]
  const octave = Math.floor(pitch / 12) - 1
  const letter = name[0].toLowerCase()
  const accidental = name.length > 1 ? (useFlats ? 'b' : '#') : null
  return { key: `${letter}${accidental ?? ''}/${octave}`, accidental }
}

interface Props {
  heldNotes: Set<number>
  useFlats?: boolean
}

/** Remix 3 port of NotationView — VexFlow grand staff (client-rendered). */
export function Notation(handle: Handle<Props>) {
  let node: HTMLDivElement | null = null
  let rafScheduled = false
  let cachedSvg: Node | null = null
  let cachedKey = ''

  // Coalesce redraws to one per animation frame. Runs on every render so the
  // SVG is refilled right after remix/ui reconciles (and wipes) the canvas.
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
    const { heldNotes, useFlats = false } = handle.props
    const pitches = compactVoicing([...heldNotes].sort((a, b) => a - b))
    const key = `${pitches.join(',')}|${useFlats}`

    // Cheap path: content unchanged — just re-attach the cached SVG if remix
    // wiped it. Only rebuild (expensive) when the chord actually changed.
    if (key === cachedKey && cachedSvg) {
      if (node.firstChild !== cachedSvg) node.replaceChildren(cachedSvg)
      return
    }

    const VF = await import('vexflow')
    const { Renderer, Stave, StaveNote, StaveConnector, Accidental, Voice, Formatter } = VF

    // Render offscreen then swap in atomically — clearing the live node before
    // the async import left it blank between frames (the flicker).
    const tmp = document.createElement('div')
    const renderer = new Renderer(tmp, Renderer.Backends.SVG)
    renderer.resize(WIDTH, HEIGHT)
    const ctx = renderer.getContext()

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

    const drawClef = (y: number, clef: 'treble' | 'bass', clefPitches: number[], restKey: string) => {
      const stave = new Stave(STAVE_X, y, STAVE_W)
      stave.addClef(clef).setContext(ctx).draw()
      const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT)
      voice.addTickables([build(clefPitches, restKey, clef)])
      new Formatter().joinVoices([voice]).format([voice], STAVE_W - 60)
      voice.draw(ctx, stave)
      return stave
    }

    const treble = drawClef(TREBLE_Y, 'treble', pitches.filter((p) => p >= CLEF_SPLIT), 'b/4')
    const bass = drawClef(BASS_Y, 'bass', pitches.filter((p) => p < CLEF_SPLIT), 'd/3')

    new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw()
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw()

    cachedSvg = tmp.firstChild
    cachedKey = key
    if (cachedSvg) node.replaceChildren(cachedSvg)
  }

  return () => {
    const { heldNotes, useFlats = false } = handle.props
    const pitches = [...heldNotes].sort((a, b) => a - b)
    const chord = detectChord(pitches, useFlats)
    // Always reschedule: remix/ui reconciles this div on every re-render and
    // wipes the imperatively-drawn SVG, so we must refill after each commit.
    // draw() itself skips the expensive rebuild when the content is unchanged.
    scheduleDraw()
    return (
      <figure className="notation">
        <figcaption className="view-title">
          Notation <span className="chord-symbol">{chord?.chordSymbol ?? '—'}</span>
        </figcaption>
        <div className="notation-canvas" mix={ref((n) => (node = n as HTMLDivElement))} />
      </figure>
    )
  }
}
