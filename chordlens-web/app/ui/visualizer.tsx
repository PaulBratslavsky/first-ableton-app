import { clientEntry, on, type Handle, type SerializableProps } from 'remix/ui'
import { AbletonBridge, type AbletonEvent, type BridgeStatus } from '../ableton/ableton.ts'
import { detectChord, pitchClass } from '../music/music.ts'
import {
  estimateKey,
  scalePcs,
  usesFlats,
  romanNumeral,
  tonicPc,
  keyFromAbleton,
  type MusicalKey,
} from '../music/theory.ts'
import { GUITAR_TUNING, BASS_TUNING, FRET_COUNT } from '../music/config.ts'
import { Piano } from './piano.tsx'
import { Fretboard } from './fretboard.tsx'
import { Push } from './push.tsx'
import { Notation } from './notation.tsx'
import { ProgressionStrip, type ChordHistoryEntry } from './progression-strip.tsx'
import { ProgressionStaff } from './progression-staff.tsx'
import { KeyBadge } from './key-badge.tsx'

const DECAY = 0.9
const SETTLE_MS = 300
const MAX_HISTORY = 24
const DEMO_CHORDS = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60, 64],
  [55, 59, 62, 65],
  [60, 64, 67, 71],
  [62, 65, 69],
]
const DEMO_STEP_MS = 1800

type Props = SerializableProps

export const Visualizer = clientEntry(
  import.meta.url,
  function Visualizer(handle: Handle<Props>) {
    // ---- input state ----
    let midiHeld = new Set<number>() // Web MIDI / demo
    let abletonHeld = new Set<number>() // Max for Live bridge
    let demo = false
    let demoTimer: ReturnType<typeof setInterval> | null = null
    let demoIndex = 0
    let webMidiOn = false

    // ---- derived/feature state ----
    let pinned: Set<number> | null = null
    let manualKey: MusicalKey | null = null
    let abletonKey: MusicalKey | null = null
    let histogram = new Array(12).fill(0)
    let showScale = true
    let showPush = true

    // ---- bridge state ----
    let status: BridgeStatus = 'connecting'
    let tempo: number | null = null
    let isPlaying = false

    // ---- chord history ----
    let history: ChordHistoryEntry[] = []
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    let lastHistoryLabel: string | null = null

    function merged(): Set<number> {
      if (abletonHeld.size === 0) return midiHeld
      if (midiHeld.size === 0) return abletonHeld
      const m = new Set(midiHeld)
      abletonHeld.forEach((n) => m.add(n))
      return m
    }

    // Recompute key histogram + record progression when the held set changes.
    function notesChanged() {
      const held = merged()
      if (!pinned && held.size > 0) {
        histogram = histogram.map((x) => x * DECAY)
        held.forEach((p) => (histogram[pitchClass(p)] += 1))
      }
      const pitches = [...held].sort((a, b) => a - b)
      const chord = detectChord(pitches, false)
      const label = chord
        ? (chord.chordSymbol ?? (pitches.length === 1 ? chord.noteNames[0] : null))
        : null
      if (label !== lastHistoryLabel) {
        lastHistoryLabel = label
        if (settleTimer) clearTimeout(settleTimer)
        if (label) {
          const entry: ChordHistoryEntry = {
            label,
            rootPc: chord?.bassPc ?? null,
            notes: chord?.noteNames ?? [],
            pitches,
          }
          settleTimer = setTimeout(() => {
            if (history.length && history[history.length - 1].label === entry.label) return
            history = [...history, entry].slice(-MAX_HISTORY)
            handle.update()
          }, SETTLE_MS)
        }
      }
      handle.update()
    }

    // ---- Ableton bridge ----
    const bridge = new AbletonBridge({
      onStatus: (s) => {
        status = s
        handle.update()
      },
      onEvent: (ev: AbletonEvent) => {
        switch (ev.type) {
          case 'note':
            if (ev.velocity > 0) abletonHeld.add(ev.pitch)
            else abletonHeld.delete(ev.pitch)
            notesChanged()
            break
          case 'transport':
            isPlaying = ev.isPlaying
            if (!ev.isPlaying) {
              abletonHeld = new Set()
              notesChanged()
            }
            handle.update()
            break
          case 'tempo':
            tempo = ev.tempo
            handle.update()
            break
          case 'key':
            abletonKey = keyFromAbleton(ev.rootPc, ev.scaleName)
            handle.update()
            break
          case 'session':
            tempo = ev.session.tempo
            isPlaying = ev.session.isPlaying
            if (ev.session.rootPc != null && ev.session.scaleName != null) {
              abletonKey = keyFromAbleton(ev.session.rootPc, ev.session.scaleName)
            }
            handle.update()
            break
        }
      },
    })
    // Browser-only: the setup phase also runs during SSR, where WebSocket and
    // handle.update() don't exist. Defer connect to after hydration.
    if (typeof document !== 'undefined') {
      setTimeout(() => bridge.connect(), 0)
      handle.signal.addEventListener('abort', () => bridge.close())
    }

    // ---- demo ----
    function setDemo(onState: boolean) {
      demo = onState
      if (demoTimer) {
        clearInterval(demoTimer)
        demoTimer = null
      }
      if (demo) {
        demoIndex = 0
        const tick = () => {
          midiHeld = new Set(DEMO_CHORDS[demoIndex % DEMO_CHORDS.length])
          demoIndex++
          notesChanged()
        }
        tick()
        demoTimer = setInterval(tick, DEMO_STEP_MS)
      } else {
        midiHeld = new Set()
        notesChanged()
      }
    }
    handle.signal.addEventListener('abort', () => {
      if (demoTimer) clearInterval(demoTimer)
    })

    // ---- Web MIDI (optional, browser only) ----
    async function enableWebMidi() {
      const req = (navigator as unknown as { requestMIDIAccess?: () => Promise<unknown> })
        .requestMIDIAccess
      if (!req) return
      try {
        const access = (await req.call(navigator)) as {
          inputs: Map<string, { onmidimessage: ((e: { data: Uint8Array }) => void) | null }>
        }
        webMidiOn = true
        access.inputs.forEach((input) => {
          input.onmidimessage = (e) => {
            const [status0, pitch, velocity] = e.data
            const cmd = status0 & 0xf0
            if (cmd === 0x90 && velocity > 0) midiHeld.add(pitch)
            else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) midiHeld.delete(pitch)
            else return
            notesChanged()
          }
        })
        handle.update()
      } catch {
        /* permission denied */
      }
    }

    function clearHistory() {
      history = []
      lastHistoryLabel = null
      handle.update()
    }

    return () => {
      const held = merged()
      const displayNotes = pinned ?? held
      const displayPitches = [...displayNotes].sort((a, b) => a - b)
      const livePitches = [...held].sort((a, b) => a - b)

      const autoKey = estimateKey(histogram)
      const key = manualKey ?? abletonKey ?? autoKey
      const keySource = manualKey ? 'manual' : abletonKey ? 'ableton' : 'auto'
      const useFlats = key ? usesFlats(key) : false
      const keyPcs = key ? scalePcs(key) : null
      const rootPc = key ? tonicPc(key) : null
      const scaleGuide = showScale ? keyPcs : null

      const chord = detectChord(displayPitches, useFlats)
      const roman = key ? romanNumeral(chord?.chordSymbol ?? null, key) : null
      const nowPlaying = chord?.chordSymbol ?? chord?.noteNames.join(' · ') ?? ' '
      const frozen = pinned !== null
      const connected = status === 'open'
      const inputLabel = demo
        ? 'Demo'
        : webMidiOn
          ? 'Web MIDI'
          : connected
            ? 'Ableton'
            : 'No input'

      return (
        <main className="app">
          <header className="app-header">
            <div className="app-brand">
              <h1>ChordLens</h1>
              <p className="app-tagline">Your playing, in instruments at once · web</p>
            </div>
            <div className="app-controls">
              <button
                type="button"
                className="pin-btn"
                mix={on('click', () => enableWebMidi())}
              >
                {webMidiOn ? '✓ Web MIDI' : 'Enable Web MIDI'}
              </button>
              <KeyBadge
                value={key}
                isAuto={manualKey === null}
                onPick={(k) => {
                  manualKey = k
                  handle.update()
                }}
                autoLabel={keySource === 'ableton' ? 'Ableton' : 'Auto'}
              />
              <button
                type="button"
                className={`pin-btn${showScale ? ' pin-btn--active' : ''}`}
                mix={on('click', () => {
                  showScale = !showScale
                  handle.update()
                })}
              >
                Scale
              </button>
              <button
                type="button"
                className={`pin-btn${showPush ? ' pin-btn--active' : ''}`}
                mix={on('click', () => {
                  showPush = !showPush
                  handle.update()
                })}
              >
                Push
              </button>
              <button
                type="button"
                className={`pin-btn${frozen ? ' pin-btn--active' : ''}`}
                disabled={!frozen && held.size === 0}
                mix={on('click', () => {
                  pinned = pinned ? null : held.size ? new Set(held) : null
                  handle.update()
                })}
              >
                {frozen ? '📌 Pinned' : 'Pin'}
              </button>
              <div className="status-indicator">
                <span className={`status-dot status-dot--${demo ? 'demo' : 'listening'}`} aria-hidden />
                <span className="status-label">{inputLabel}</span>
                <button
                  type="button"
                  className="status-demo-btn"
                  mix={on('click', () => setDemo(!demo))}
                >
                  {demo ? 'Stop demo' : 'Demo'}
                </button>
              </div>
              <div className="status-indicator">
                <span
                  className={`status-dot status-dot--${connected ? 'listening' : 'no-input'}`}
                  aria-hidden
                />
                <span className="status-label">
                  {connected
                    ? `Ableton${tempo != null ? ` · ${Math.round(tempo)} BPM` : ''}`
                    : status === 'connecting'
                      ? 'Connecting…'
                      : 'Ableton offline'}
                </span>
                <button
                  type="button"
                  className="status-icon-btn"
                  mix={on('click', () => {
                    abletonHeld = new Set()
                    isPlaying = false
                    bridge.reconnect()
                    handle.update()
                  })}
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="status-demo-btn"
                  disabled={!connected}
                  mix={on('click', () => {
                    if (isPlaying) bridge.send('stop_playback', {})
                    else bridge.send('start_playback', {})
                  })}
                >
                  {isPlaying ? '⏹ Stop' : '▶ Play'}
                </button>
              </div>
            </div>
          </header>

          <ProgressionStrip history={history} onClear={clearHistory} />

          <section className="panel panel--sheet">
            <div className="view-title">Progression · sheet</div>
            <div className="sheet-scroll">
              {history.length === 0 ? (
                <p className="idle-hint" style={{ visibility: 'visible' }}>
                  Play a progression — it'll be written out here, chord by chord.
                </p>
              ) : (
                <ProgressionStaff history={history} useFlats={useFlats} />
              )}
            </div>
          </section>

          <section className="panel panel--hero">
            <div className="view-title view-title--row">
              <span>Piano{frozen ? ' · pinned' : ''}</span>
              <span className="now-playing">
                {nowPlaying}
                {roman && <span className="roman">{roman}</span>}
              </span>
            </div>
            <Piano heldNotes={displayNotes} keyPcs={keyPcs} scaleGuide={scaleGuide} />
            <p
              className="idle-hint"
              style={{ visibility: displayPitches.length === 0 ? 'visible' : 'hidden' }}
            >
              Enable Web MIDI, hit Demo, or play into the ChordLens device in Ableton.
            </p>
          </section>

          <section className="grid">
            <div className="panel">
              <Fretboard
                label="Guitar"
                tuning={GUITAR_TUNING}
                fretCount={FRET_COUNT}
                heldNotes={displayNotes}
                keyPcs={keyPcs}
                scaleGuide={scaleGuide}
                useFlats={useFlats}
              />
            </div>
            <div className="panel">
              <Fretboard
                label="Bass"
                tuning={BASS_TUNING}
                fretCount={FRET_COUNT}
                heldNotes={displayNotes}
                keyPcs={keyPcs}
                scaleGuide={scaleGuide}
                useFlats={useFlats}
              />
            </div>
          </section>

          {showPush && (
            <section className="panel panel--sheet">
              <div className="view-title">Push · chromatic</div>
              <Push heldNotes={displayNotes} scalePcs={keyPcs} rootPc={rootPc} />
            </section>
          )}

          <section className="panel panel--notation">
            <Notation heldNotes={displayNotes} useFlats={useFlats} />
          </section>

          {/* keep livePitches referenced for clarity (history uses live notes) */}
          {livePitches.length < 0 && <span />}
        </main>
      )
    }
  },
)
