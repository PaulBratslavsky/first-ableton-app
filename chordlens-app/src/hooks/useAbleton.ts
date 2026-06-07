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
  /** Ableton's song key (root pitch-class + scale name), or null. */
  liveKey: { rootPc: number; scaleName: string } | null
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
  /** Force a fresh connection attempt now. */
  reconnect: () => void
}

export function useAbleton(url?: string): UseAbleton {
  const bridgeRef = useRef<AbletonBridge | null>(null)
  const [status, setStatus] = useState<BridgeStatus>('connecting')
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [tempo, setTempo] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [heldNotes, setHeldNotes] = useState<Set<number>>(new Set())
  const [liveKey, setLiveKey] = useState<{ rootPc: number; scaleName: string } | null>(null)

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
          // Stopping clears any notes left stuck on (Ableton doesn't always
          // send note-offs when the transport stops).
          if (!ev.isPlaying) setHeldNotes(new Set())
          break
        case 'tempo':
          setTempo(ev.tempo)
          break
        case 'key':
          setLiveKey({ rootPc: ev.rootPc, scaleName: ev.scaleName })
          break
        case 'session':
          setSession(ev.session)
          setTempo(ev.session.tempo)
          setIsPlaying(ev.session.isPlaying)
          if (ev.session.rootPc != null && ev.session.scaleName != null) {
            setLiveKey({ rootPc: ev.session.rootPc, scaleName: ev.session.scaleName })
          }
          break
      }
    }

    const bridge = new AbletonBridge({
      url,
      onEvent: handleEvent,
      onStatus: (s) => {
        setStatus(s)
        // On (re)connect, pull the session via a CORRELATED request — its reply
        // carries tempo/transport/key. A plain send()'s reply has no `type`
        // field, so the event router drops it (that was the missing-BPM bug).
        if (s === 'open') {
          bridgeRef.current
            ?.request('get_session', {})
            .then((info) => {
              if (info) handleEvent({ type: 'session', session: info as SessionInfo })
            })
            .catch(() => {})
        }
      },
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
    bridgeRef.current
      ?.request('get_session', {})
      .then((info) => {
        if (!info) return
        const s = info as SessionInfo
        setSession(s)
        if (s.tempo != null) setTempo(s.tempo)
        setIsPlaying(s.isPlaying)
        if (s.rootPc != null && s.scaleName != null) {
          setLiveKey({ rootPc: s.rootPc, scaleName: s.scaleName })
        }
      })
      .catch(() => {})
  }, [])
  const reconnect = useCallback(() => {
    // Refresh: drop stale local state (stuck keys, old transport), then
    // reconnect — the fresh session reply re-pulls tempo/transport/key.
    setHeldNotes(new Set())
    setIsPlaying(false)
    bridgeRef.current?.reconnect()
  }, [])

  const pitches = [...heldNotes].sort((a, b) => a - b)

  return {
    status,
    connected: status === 'open',
    session,
    tempo,
    isPlaying,
    liveKey,
    heldNotes,
    pitches,
    setTempo: setTempoCmd,
    startPlayback,
    stopPlayback,
    fireClip,
    stopTrackClips,
    createMidiTrack,
    refreshSession,
    reconnect,
  }
}
