import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  AbletonBridge,
  applyNote,
  heldFor,
  type AbletonEvent,
  type AbletonTrack,
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
  /**
   * Notes currently held — from the chosen track, or every track at once when
   * no track is chosen.
   */
  heldNotes: Set<number>
  /** Sorted held pitches, low to high (matches usePushMidi). */
  pitches: number[]
  /** Tracks with a ChordLens device on them, as reported by the hub. */
  tracks: AbletonTrack[]
  /** Held notes per track index, for showing which track is playing what. */
  notesByTrack: Map<number, Set<number>>
  /** Watch one track, or null to merge them all. */
  trackFilter: number | null
  setTrackFilter: (index: number | null) => void

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
  const [notesByTrack, setNotesByTrack] = useState<Map<number, Set<number>>>(
    () => new Map(),
  )
  const [tracks, setTracks] = useState<AbletonTrack[]>([])
  const [trackFilter, setTrackFilter] = useState<number | null>(null)
  const [liveKey, setLiveKey] = useState<{ rootPc: number; scaleName: string } | null>(null)

  useEffect(() => {
    const handleEvent = (ev: AbletonEvent) => {
      switch (ev.type) {
        case 'note':
          setNotesByTrack((prev) => applyNote(prev, ev))
          break
        case 'tracks':
          setTracks(ev.tracks)
          // Don't keep watching a track whose device has gone.
          setTrackFilter((current) =>
            current != null && !ev.tracks.some((t) => t.index === current)
              ? null
              : current,
          )
          break
        case 'transport':
          setIsPlaying(ev.isPlaying)
          // Stopping clears any notes left stuck on (Ableton doesn't always
          // send note-offs when the transport stops).
          if (!ev.isPlaying) setNotesByTrack(new Map())
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
    setNotesByTrack(new Map())
    setIsPlaying(false)
    bridgeRef.current?.reconnect()
  }, [])

  const heldNotes = useMemo(
    () => heldFor(notesByTrack, trackFilter),
    [notesByTrack, trackFilter],
  )

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
    tracks,
    notesByTrack,
    trackFilter,
    setTrackFilter,
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
