import { useEffect, useRef, useState, useCallback } from 'react'

export interface ChordHistoryEntry {
  label: string
  /** Pitch-class of the chord root, for coloring the chip. */
  rootPc: number | null
}

const SETTLE_MS = 300 // a chord must be held this long to be recorded
const MAX_ENTRIES = 24

/**
 * Records the chords you actually settle on (held ~300ms), de-duplicating
 * consecutive repeats, so the strip reads like a progression: C · Am · F · G.
 */
export function useChordHistory(label: string | null, rootPc: number | null) {
  const [history, setHistory] = useState<ChordHistoryEntry[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!label) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setHistory((prev) => {
        if (prev.length && prev[prev.length - 1].label === label) return prev
        return [...prev, { label, rootPc }].slice(-MAX_ENTRIES)
      })
    }, SETTLE_MS)
    return () => clearTimeout(timer.current)
  }, [label, rootPc])

  const clear = useCallback(() => setHistory([]), [])

  return { history, clear }
}
