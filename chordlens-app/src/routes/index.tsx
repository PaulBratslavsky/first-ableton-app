import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePushMidi } from '../hooks/usePushMidi'
import { useAbleton } from '../hooks/useAbleton'
import { useKeyEstimate } from '../hooks/useKeyEstimate'
import { useChordHistory } from '../hooks/useChordHistory'
import { StatusIndicator } from '../components/StatusIndicator'
import { AbletonStatus } from '../components/AbletonStatus'
import { InputPicker } from '../components/InputPicker'
import { KeyBadge } from '../components/KeyBadge'
import { ProgressionStrip } from '../components/ProgressionStrip'
import { ProgressionStaff } from '../components/ProgressionStaff'
import { PianoView } from '../components/PianoView'
import { PushView } from '../components/PushView'
import { FretboardView } from '../components/FretboardView'
import { NotationView } from '../components/NotationView'
import { detectChord } from '../lib/music'
import { romanNumeral, scalePcs, tonicPc, usesFlats } from '../lib/theory'
import { GUITAR_TUNING, BASS_TUNING, FRET_COUNT } from '../lib/config'

export const Route = createFileRoute('/')({ component: Visualizer })

function Visualizer() {
  const {
    heldNotes: midiHeld,
    status,
    inputs,
    selectedInput,
    refreshInputs,
    selectInput,
    toggleDemo,
  } = usePushMidi()

  // Notes + transport from the ChordLens Max for Live device (max-for-live/).
  const live = useAbleton()

  // The views react to either input path: the IAC bus / keyboard (usePushMidi)
  // or notes played straight into the Max for Live device.
  const heldNotes = useMemo(() => {
    if (live.heldNotes.size === 0) return midiHeld
    if (midiHeld.size === 0) return live.heldNotes
    const merged = new Set(midiHeld)
    live.heldNotes.forEach((n) => merged.add(n))
    return merged
  }, [midiHeld, live.heldNotes])
  const pitches = useMemo(
    () => [...heldNotes].sort((a, b) => a - b),
    [heldNotes],
  )

  // --- Pin / freeze a voicing -----------------------------------------------
  const [pinned, setPinned] = useState<Set<number> | null>(null)
  const frozen = pinned !== null
  const displayNotes = pinned ?? heldNotes
  const displayPitches = useMemo(
    () => [...displayNotes].sort((a, b) => a - b),
    [displayNotes],
  )

  const heldRef = useRef(heldNotes)
  heldRef.current = heldNotes
  const togglePin = useCallback(() => {
    setPinned((prev) => {
      if (prev) return null
      return heldRef.current.size ? new Set(heldRef.current) : prev
    })
  }, [])

  // Spacebar pins/unpins (unless a form control is focused).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'BUTTON') return
      e.preventDefault()
      togglePin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePin])

  // --- Key / scale awareness -------------------------------------------------
  const { key, isAuto, setManualKey } = useKeyEstimate(pitches, frozen)
  const useFlats = key ? usesFlats(key) : false
  const keyPcs = useMemo(() => (key ? scalePcs(key) : null), [key])
  const rootPc = key ? tonicPc(key) : null
  const [showScale, setShowScale] = useState(true)
  const [showPush, setShowPush] = useState(true)
  const scaleGuide = showScale ? keyPcs : null

  const chord = detectChord(displayPitches, useFlats)
  const roman = key ? romanNumeral(chord?.chordSymbol ?? null, key) : null

  // --- Progression history (records live playing, not the frozen view) -------
  const liveChord = detectChord(pitches, useFlats)
  const historyLabel = liveChord
    ? (liveChord.chordSymbol ??
      (pitches.length === 1 ? liveChord.noteNames[0] : null))
    : null
  const { history, clear } = useChordHistory(
    historyLabel,
    liveChord?.bassPc ?? null,
    liveChord?.noteNames ?? [],
    pitches,
  )

  const isIdle = displayPitches.length === 0
  const nowPlaying = chord?.chordSymbol ?? chord?.noteNames.join(' · ') ?? ' '

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-brand">
          <h1>ChordLens</h1>
          <p className="app-tagline">Your Push playing, in four instruments at once</p>
        </div>
        <div className="app-controls">
          {status !== 'demo' && (
            <InputPicker
              inputs={inputs}
              selectedInput={selectedInput}
              onSelect={selectInput}
              onRefresh={refreshInputs}
            />
          )}
          <KeyBadge value={key} isAuto={isAuto} onPick={setManualKey} />
          <button
            type="button"
            className={`pin-btn${showScale ? ' pin-btn--active' : ''}`}
            onClick={() => setShowScale((s) => !s)}
            title="Faintly show the whole key across the views"
          >
            Scale
          </button>
          <button
            type="button"
            className={`pin-btn${showPush ? ' pin-btn--active' : ''}`}
            onClick={() => setShowPush((s) => !s)}
            title="Show the Push-style chromatic pad grid"
          >
            Push
          </button>
          <button
            type="button"
            className={`pin-btn${frozen ? ' pin-btn--active' : ''}`}
            onClick={togglePin}
            disabled={!frozen && heldNotes.size === 0}
            title="Freeze the current chord (Space)"
          >
            {frozen ? '📌 Pinned' : 'Pin'}
          </button>
          <StatusIndicator status={status} onToggleDemo={toggleDemo} />
          <AbletonStatus
            connected={live.connected}
            tempo={live.tempo}
            isPlaying={live.isPlaying}
            onTogglePlay={live.isPlaying ? live.stopPlayback : live.startPlayback}
          />
        </div>
      </header>

      <ProgressionStrip history={history} onClear={clear} />

      {/* Piano — the hero view. */}
      <section className="panel panel--hero">
        <div className="view-title view-title--row">
          <span>Piano{frozen ? ' · pinned' : ''}</span>
          <span className="now-playing">
            {nowPlaying}
            {roman && <span className="roman">{roman}</span>}
          </span>
        </div>
        <PianoView heldNotes={displayNotes} keyPcs={keyPcs} scaleGuide={scaleGuide} />
        {/* Always rendered (hidden while playing) so the panel never resizes. */}
        <p className="idle-hint" style={{ visibility: isIdle ? 'visible' : 'hidden' }}>
          {status === 'no-input' && !live.connected
            ? 'Choose a MIDI input above, or play into the ChordLens device in Ableton, to begin.'
            : 'Play something — the views will light up here.'}
        </p>
      </section>

      {/* Continuous notation sheet of the whole progression, lead-sheet style. */}
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

      <section className="grid">
        <div className="panel">
          <FretboardView
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
          <FretboardView
            label="Bass"
            tuning={BASS_TUNING}
            fretCount={FRET_COUNT}
            heldNotes={displayNotes}
            keyPcs={keyPcs}
            scaleGuide={scaleGuide}
            useFlats={useFlats}
          />
        </div>
        <div className="panel panel--notation">
          <NotationView heldNotes={displayNotes} useFlats={useFlats} />
        </div>
        {showPush && (
          <div className="panel">
            <div className="view-title">Push · chromatic</div>
            <PushView
              heldNotes={displayNotes}
              scalePcs={keyPcs}
              rootPc={rootPc}
            />
          </div>
        )}
      </section>
    </main>
  )
}
