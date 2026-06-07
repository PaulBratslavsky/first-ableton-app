import { useEffect, useRef, useState, useCallback } from 'react'

export interface ChordHistoryEntry {
  label: string
  /** Pitch-class of the chord root, for coloring the chip. */
  rootPc: number | null
  /** Note names that made up the chord (for the "notes" view). */
  notes: string[]
  /** Actual MIDI pitches of the voicing (for the "staff" notation view). */
  pitches: number[]
}

const SETTLE_MS = 300 // a chord must be held this long to be recorded
const MAX_ENTRIES = 24

/**
 * Records the chords you actually settle on (held ~300ms), de-duplicating
 * consecutive repeats, so the strip reads like a progression: C · Am · F · G.
 *
 * `notes` is read through a ref so updating it every render doesn't reset the
 * settle timer — only `label`/`rootPc` drive recording.
 */
export function useChordHistory(
  label: string | null,
  rootPc: number | null,
  notes: string[],
  pitches: number[],
) {
  const [history, setHistory] = useState<ChordHistoryEntry[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const notesRef = useRef(notes)
  notesRef.current = notes
  const pitchesRef = useRef(pitches)
  pitchesRef.current = pitches

  useEffect(() => {
    if (!label) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setHistory((prev) => {
        if (prev.length && prev[prev.length - 1].label === label) return prev
        return [
          ...prev,
          { label, rootPc, notes: notesRef.current, pitches: pitchesRef.current },
        ].slice(-MAX_ENTRIES)
      })
    }, SETTLE_MS)
    return () => clearTimeout(timer.current)
  }, [label, rootPc])

  const clear = useCallback(() => setHistory([]), [])

  return { history, clear }
}
