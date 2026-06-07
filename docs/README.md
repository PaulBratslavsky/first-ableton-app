# ChordLens docs

- **[architecture.md](./architecture.md)** — how the system fits together: the
  Tauri app (Rust native MIDI + React frontend), the Max for Live device bridge
  (WebSocket :17999), the AbletonMCP socket (:9877), protocols, file map, and
  design decisions. Diagrams render on GitHub (Mermaid).
- **chordlens-features.png** — feature overview image.

Related docs elsewhere in the repo:
- [`../max-for-live/README.md`](../max-for-live/README.md) — Max for Live device
  build steps + full WebSocket protocol.
- [`../resources/`](../resources/) — product, user, requirements, and spec notes.
