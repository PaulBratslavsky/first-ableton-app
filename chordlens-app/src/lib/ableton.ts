/**
 * ChordLens ⇄ Ableton bridge — WebSocket client for the ChordLens Max for Live
 * device (max-for-live/ChordLens.amxd).
 *
 * The device hosts a WebSocket server on ws://127.0.0.1:17999 and speaks plain
 * JSON, one object per message. This module is a thin, framework-agnostic client
 * with auto-reconnect; the React glue lives in hooks/useAbleton.ts.
 *
 * Protocol (mirror of max-for-live/chordlens.server.js):
 *   Device → app (events):
 *     { type: "hello", port }
 *     { type: "note", pitch, velocity }        // velocity 0 == note-off
 *     { type: "transport", isPlaying }
 *     { type: "tempo", tempo }
 *     { type: "session", session }
 *   Device → app (command replies): { id, ok, result } | { id, error }
 *   App → device (commands):        { id?, type, ...params }
 */

export const DEFAULT_ABLETON_WS = 'ws://127.0.0.1:17999'

export interface SessionInfo {
  tempo: number | null
  isPlaying: boolean
  signatureNumerator: number | null
  signatureDenominator: number | null
  trackCount: number
  returnTrackCount: number
}

/** Events pushed from the device. */
export type AbletonEvent =
  | { type: 'hello'; port: number }
  | { type: 'note'; pitch: number; velocity: number }
  | { type: 'transport'; isPlaying: boolean }
  | { type: 'tempo'; tempo: number }
  | { type: 'session'; session: SessionInfo }
  | { type: 'error'; message: string }

export type BridgeStatus = 'connecting' | 'open' | 'closed'

/** Commands the device understands (params per command). */
export interface Commands {
  get_session: Record<string, never>
  set_tempo: { tempo: number }
  start_playback: Record<string, never>
  stop_playback: Record<string, never>
  create_midi_track: { index?: number }
  set_track_name: { track: number; name: string }
  fire_clip: { track: number; clip: number }
  stop_clip: { track: number }
  get_track_info: { track: number }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface AbletonBridgeOptions {
  url?: string
  /** Called for every unsolicited event from the device. */
  onEvent?: (event: AbletonEvent) => void
  /** Called when the connection status changes. */
  onStatus?: (status: BridgeStatus) => void
  /** Reconnect backoff in ms (default 1500). */
  reconnectMs?: number
  /** Per-command reply timeout in ms (default 5000). */
  commandTimeoutMs?: number
}

/**
 * Self-reconnecting client. Construct once, call `connect()`, and use
 * `send()` for fire-and-forget or `request()` for commands you want a reply to.
 */
export class AbletonBridge {
  private url: string
  private ws: WebSocket | null = null
  private closedByUser = false
  private nextId = 1
  private pending = new Map<number, Pending>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private onEvent?: (event: AbletonEvent) => void
  private onStatus?: (status: BridgeStatus) => void
  private reconnectMs: number
  private commandTimeoutMs: number

  constructor(opts: AbletonBridgeOptions = {}) {
    this.url = opts.url ?? DEFAULT_ABLETON_WS
    this.onEvent = opts.onEvent
    this.onStatus = opts.onStatus
    this.reconnectMs = opts.reconnectMs ?? 1500
    this.commandTimeoutMs = opts.commandTimeoutMs ?? 5000
  }

  connect(): void {
    this.closedByUser = false
    this.open()
  }

  private open(): void {
    this.onStatus?.('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => this.onStatus?.('open')

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(ev.data as string)
      } catch {
        return
      }
      // Command reply?
      if (typeof msg.id === 'number') {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          clearTimeout(p.timer)
          if (msg.error) p.reject(new Error(String(msg.error)))
          else p.resolve(msg.result)
          return
        }
      }
      this.onEvent?.(msg as unknown as AbletonEvent)
    }

    ws.onclose = () => {
      this.onStatus?.('closed')
      this.failAllPending(new Error('connection closed'))
      if (!this.closedByUser) this.scheduleReconnect()
    }

    ws.onerror = () => ws.close()
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, this.reconnectMs)
  }

  private failAllPending(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** Fire-and-forget command. */
  send<K extends keyof Commands>(type: K, params: Commands[K]): void {
    if (!this.isOpen) return
    this.ws!.send(JSON.stringify({ type, ...params }))
  }

  /** Send a command and await its reply. Rejects on device error or timeout. */
  request<K extends keyof Commands>(
    type: K,
    params: Commands[K],
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.isOpen) {
        reject(new Error('not connected'))
        return
      }
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`command "${type}" timed out`))
      }, this.commandTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ id, type, ...params }))
    })
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.failAllPending(new Error('closed'))
    this.ws?.close()
    this.ws = null
  }
}
