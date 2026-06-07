import { type Handle } from 'remix/ui'
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

/**
 * VexFlow grand staff for the current chord. Rendered to an SVG string and
 * applied via the `innerHTML` prop so remix/ui sets it declaratively and never
 * wipes it on re-render (no flicker / layout shift).
 */
export function Notation(handle: Handle<Props>) {
  let cachedKey = ''
  let cachedSvg = ''
  let building = false

  async function rebuild(key: string) {
    const VF = await import('vexflow')
    const { Renderer, Stave, StaveNote, StaveConnector, Accidental, Voice, Formatter } = VF
    const { heldNotes, useFlats = false } = handle.props
    const pitches = compactVoicing([...heldNotes].sort((a, b) => a - b))

    const div = document.createElement('div')
    const renderer = new Renderer(div, Renderer.Backends.SVG)
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

    cachedSvg = div.innerHTML
    cachedKey = key
    handle.update()
  }

  return () => {
    const { heldNotes, useFlats = false } = handle.props
    const pitches = [...heldNotes].sort((a, b) => a - b)
    const chord = detectChord(pitches, useFlats)
    const key = `${pitches.join(',')}|${useFlats}`
    if (key !== cachedKey && typeof document !== 'undefined' && !building) {
      building = true
      rebuild(key)
        .catch(() => {})
        .finally(() => {
          building = false
        })
    }
    return (
      <figure className="notation">
        <figcaption className="view-title">
          Notation{' '}
          <span className="chord-symbol">
            {chord?.chordSymbol ??
              (chord?.noteNames?.length ? chord.noteNames.join(' · ') : '—')}
          </span>
        </figcaption>
        <div className="notation-canvas" innerHTML={cachedSvg} />
      </figure>
    )
  }
}
