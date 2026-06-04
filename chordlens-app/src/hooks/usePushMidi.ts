import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type ConnectionStatus =
  | 'no-input' // no MIDI input selected yet
  | 'listening' // reading a MIDI input
  | 'demo'

/** Note event from the Rust backend. velocity 0 == note-off. */
interface NoteEvent {
  pitch: number
  velocity: number
}

const DEMO_CHORDS: number[][] = [
  [60, 64, 67], //  C  major
  [57, 60, 64], //  Am
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 65], // G7
  [60, 64, 67, 71], // Cmaj7
  [62, 65, 69], //  Dm
]
const DEMO_STEP_MS = 1800

/**
 * Running inside the Tauri desktop shell? In a plain browser (e.g. `npm run dev`
 * for UI work) there's no native MIDI — only demo mode is available there.
 */
const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

interface PushMidi {
  heldNotes: Set<number>
  pitches: number[]
  status: ConnectionStatus
  /** Available MIDI input port names. */
  inputs: string[]
  /** Index of the selected input, or null. */
  selectedInput: number | null
  /** Re-scan available MIDI inputs. */
  refreshInputs: () => void
  /** Open a MIDI input by index and start listening. */
  selectInput: (index: number) => void
  toggleDemo: () => void
}

export function usePushMidi(): PushMidi {
  const [heldNotes, setHeldNotes] = useState<Set<number>>(new Set())
  const [status, setStatus] = useState<ConnectionStatus>('no-input')
  const [demo, setDemo] = useState(false)
  const [inputs, setInputs] = useState<string[]>([])
  const [selectedInput, setSelectedInput] = useState<number | null>(null)

  const applyMessage = useCallback(({ pitch, velocity }: NoteEvent) => {
    setHeldNotes((prev) => {
      const next = new Set(prev)
      if (velocity > 0) next.add(pitch)
      else next.delete(pitch)
      return next
    })
  }, [])

  // --- Demo mode: cycle sample chords on a timer. ---
  useEffect(() => {
    if (!demo) return
    setStatus('demo')
    let i = 0
    const play = () => setHeldNotes(new Set(DEMO_CHORDS[i % DEMO_CHORDS.length]))
    play()
    const id = setInterval(() => {
      i += 1
      play()
    }, DEMO_STEP_MS)
    return () => clearInterval(id)
  }, [demo])

  const refreshInputs = useCallback(() => {
    if (!IS_TAURI) return
    invoke<string[]>('list_midi_inputs')
      .then(setInputs)
      .catch(() => setInputs([]))
  }, [])

  const selectInput = useCallback((index: number) => {
    if (!IS_TAURI) return
    invoke<string>('select_midi_input', { index })
      .then(() => {
        setSelectedInput(index)
        setStatus('listening')
        setHeldNotes(new Set())
      })
      .catch(() => setStatus('no-input'))
  }, [])

  // --- Native MIDI: subscribe to backend note events. ---
  useEffect(() => {
    if (!IS_TAURI || demo) return

    setStatus(selectedInput != null ? 'listening' : 'no-input')
    refreshInputs()

    let unlisten: (() => void) | undefined
    listen<NoteEvent>('midi-note', (event) => applyMessage(event.payload)).then(
      (fn) => {
        unlisten = fn
      },
    )
    return () => unlisten?.()
    // selectedInput intentionally omitted: re-subscribing isn't needed when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, applyMessage, refreshInputs])

  const toggleDemo = useCallback(() => {
    setHeldNotes(new Set())
    setDemo((d) => !d)
  }, [])

  const pitches = [...heldNotes].sort((a, b) => a - b)

  return {
    heldNotes,
    pitches,
    status,
    inputs,
    selectedInput,
    refreshInputs,
    selectInput,
    toggleDemo,
  }
}
