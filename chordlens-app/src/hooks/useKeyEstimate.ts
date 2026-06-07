import { useEffect, useMemo, useState, useCallback } from 'react'
import { pitchClass } from '../lib/music'
import { estimateKey, type MusicalKey } from '../lib/theory'

const DECAY = 0.9 // older notes fade as new ones arrive

/**
 * Maintains a slowly-adapting estimate of the musical key from what's played.
 * Precedence: manual override → Ableton's song key (`external`) → auto-estimate.
 * Updates pause while `frozen` (e.g. pinned).
 */
export function useKeyEstimate(
  pitches: number[],
  frozen: boolean,
  external: MusicalKey | null = null,
) {
  const [histogram, setHistogram] = useState<number[]>(() => new Array(12).fill(0))
  const [manual, setManual] = useState<MusicalKey | null>(null)

  const heldKey = pitches.join(',')
  useEffect(() => {
    if (frozen || pitches.length === 0) return
    setHistogram((prev) => {
      const next = prev.map((x) => x * DECAY)
      for (const p of pitches) next[pitchClass(p)] += 1
      return next
    })
    // heldKey captures the set; pitches is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, frozen])

  const autoKey = useMemo(() => estimateKey(histogram), [histogram])
  const key = manual ?? external ?? autoKey
  // Source of the effective key, for labeling the badge.
  const source: 'manual' | 'ableton' | 'auto' = manual
    ? 'manual'
    : external
      ? 'ableton'
      : 'auto'

  const setManualKey = useCallback((k: MusicalKey | null) => setManual(k), [])
  const resetAuto = useCallback(() => setManual(null), [])

  return {
    key,
    autoKey,
    isAuto: manual === null,
    source,
    setManualKey,
    resetAuto,
  }
}
