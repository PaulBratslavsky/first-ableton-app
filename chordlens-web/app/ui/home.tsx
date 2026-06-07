import { css } from 'remix/ui'

import { Document } from './document.tsx'
import { Piano } from './piano.tsx'

// Demo chord (C major triad) so the page renders something without Ableton yet.
const DEMO_CHORD = new Set([60, 64, 67])

export function HomePage() {
  return () => (
    <Document title="ChordLens · web">
      <main
        mix={css({
          minHeight: '100vh',
          margin: 0,
          padding: '24px',
          background: '#0e0f13',
          color: '#e6e8ee',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        })}
      >
        <h1 mix={css({ fontSize: '22px', margin: '0 0 4px', fontWeight: 700 })}>
          ChordLens{' '}
          <span mix={css({ color: '#7b8194', fontSize: '13px', fontWeight: 400 })}>
            · web (Remix 3)
          </span>
        </h1>
        <p mix={css({ color: '#7b8194', margin: '0 0 20px', fontSize: '13px' })}>
          Piano-view porting spike — C major demo chord.
        </p>
        <section
          mix={css({
            background: '#16181d',
            border: '1px solid #262a33',
            borderRadius: '14px',
            padding: '16px',
          })}
        >
          <Piano heldNotes={DEMO_CHORD} />
        </section>
      </main>
    </Document>
  )
}
