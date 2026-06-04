import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePushMidi } from '../hooks/usePushMidi'
import { useKeyEstimate } from '../hooks/useKeyEstimate'
import { useChordHistory } from '../hooks/useChordHistory'
import { StatusIndicator } from '../components/StatusIndicator'
import { InputPicker } from '../components/InputPicker'
import { KeyBadge } from '../components/KeyBadge'
import { ProgressionStrip } from '../components/ProgressionStrip'
import { PianoView } from '../components/PianoView'
import { FretboardView } from '../components/FretboardView'
import { NotationView } from '../components/NotationView'
import { detectChord } from '../lib/music'
import { romanNumeral, scalePcs, usesFlats } from '../lib/theory'
import { GUITAR_TUNING, BASS_TUNING, FRET_COUNT } from '../lib/config'

export const Route = createFileRoute('/')({ component: Visualizer })

function Visualizer() {
  const {
    heldNotes,
    pitches,
    status,
    inputs,
    selectedInput,
    refreshInputs,
    selectInput,
    toggleDemo,
  } = usePushMidi()

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
  const [showScale, setShowScale] = useState(true)
  const scaleGuide = showScale ? keyPcs : null

  const chord = detectChord(displayPitches, useFlats)
  const roman = key ? romanNumeral(chord?.chordSymbol ?? null, key) : null

  // --- Progression history (records live playing, not the frozen view) -------
  const liveChord = detectChord(pitches, useFlats)
  const historyLabel = liveChord
    ? (liveChord.chordSymbol ??
      (pitches.length === 1 ? liveChord.noteNames[0] : null))
    : null
  const { history, clear } = useChordHistory(historyLabel, liveChord?.bassPc ?? null)

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
            className={`pin-btn${frozen ? ' pin-btn--active' : ''}`}
            onClick={togglePin}
            disabled={!frozen && heldNotes.size === 0}
            title="Freeze the current chord (Space)"
          >
            {frozen ? '📌 Pinned' : 'Pin'}
          </button>
          <StatusIndicator status={status} onToggleDemo={toggleDemo} />
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
          {status === 'no-input'
            ? 'Choose a MIDI input above (your keyboard, or an IAC bus from Ableton) to begin.'
            : 'Play something — the views will light up here.'}
        </p>
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
      </section>
    </main>
  )
}
