import { Document } from './document.tsx'
import { Visualizer } from './visualizer.tsx'

export function HomePage() {
  return () => (
    <Document title="ChordLens · web">
      <Visualizer />
    </Document>
  )
}
