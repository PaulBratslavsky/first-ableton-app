import { useEffect, useRef, useState, useCallback } from 'react'
import {
  AbletonBridge,
  type AbletonEvent,
  type BridgeStatus,
  type SessionInfo,
} from '#/lib/ableton'

/**
 * React hook for the ChordLens ⇄ Ableton WebSocket bridge (the Max for Live
 * device in max-for-live/). It gives you:
 *
 *   - live transport/session state pushed from Ableton, and
 *   - held notes coming straight from the device's MIDI input (an alternative
 *     to the IAC-bus path in usePushMidi — no virtual MIDI port required), and
 *   - typed command helpers to control Ableton.
 *
 * The bridge auto-reconnects, so the hook works whether or not Ableton/the
 * device is running yet.
 */

export interface UseAbleton {
  status: BridgeStatus
  /** True once the WebSocket is open. */
  connected: boolean
  /** Live session snapshot (tempo, track count, …), or null until received. */
  session: SessionInfo | null
  /** Transport tempo in BPM (mirrors session.tempo, updated live). */
  tempo: number | null
  /** Whether Ableton's transport is playing. */
  isPlaying: boolean
  /** Notes currently held on the device's MIDI input. */
  heldNotes: Set<number>
  /** Sorted held pitches, low to high (matches usePushMidi). */
  pitches: number[]

  // Command helpers ---------------------------------------------------------
  setTempo: (bpm: number) => void
  startPlayback: () => void
  stopPlayback: () => void
  fireClip: (track: number, clip: number) => void
  stopTrackClips: (track: number) => void
  createMidiTrack: (index?: number) => void
  refreshSession: () => void
}

export function useAbleton(url?: string): UseAbleton {
  const bridgeRef = useRef<AbletonBridge | null>(null)
  const [status, setStatus] = useState<BridgeStatus>('connecting')
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [tempo, setTempo] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [heldNotes, setHeldNotes] = useState<Set<number>>(new Set())

  useEffect(() => {
    const handleEvent = (ev: AbletonEvent) => {
      switch (ev.type) {
        case 'note':
          setHeldNotes((prev) => {
            const next = new Set(prev)
            if (ev.velocity > 0) next.add(ev.pitch)
            else next.delete(ev.pitch)
            return next
          })
          break
        case 'transport':
          setIsPlaying(ev.isPlaying)
          break
        case 'tempo':
          setTempo(ev.tempo)
          break
        case 'session':
          setSession(ev.session)
          setTempo(ev.session.tempo)
          setIsPlaying(ev.session.isPlaying)
          break
      }
    }

    const bridge = new AbletonBridge({
      url,
      onEvent: handleEvent,
      onStatus: setStatus,
    })
    bridgeRef.current = bridge
    bridge.connect()

    return () => {
      bridge.close()
      bridgeRef.current = null
    }
  }, [url])

  const setTempoCmd = useCallback((bpm: number) => {
    bridgeRef.current?.send('set_tempo', { tempo: bpm })
  }, [])
  const startPlayback = useCallback(() => {
    bridgeRef.current?.send('start_playback', {})
  }, [])
  const stopPlayback = useCallback(() => {
    bridgeRef.current?.send('stop_playback', {})
  }, [])
  const fireClip = useCallback((track: number, clip: number) => {
    bridgeRef.current?.send('fire_clip', { track, clip })
  }, [])
  const stopTrackClips = useCallback((track: number) => {
    bridgeRef.current?.send('stop_clip', { track })
  }, [])
  const createMidiTrack = useCallback((index = -1) => {
    bridgeRef.current?.send('create_midi_track', { index })
  }, [])
  const refreshSession = useCallback(() => {
    bridgeRef.current?.send('get_session', {})
  }, [])

  const pitches = [...heldNotes].sort((a, b) => a - b)

  return {
    status,
    connected: status === 'open',
    session,
    tempo,
    isPlaying,
    heldNotes,
    pitches,
    setTempo: setTempoCmd,
    startPlayback,
    stopPlayback,
    fireClip,
    stopTrackClips,
    createMidiTrack,
    refreshSession,
  }
}
