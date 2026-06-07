# ChordLens → Remix 3 migration plan

Moving the ChordLens frontend from **React + TanStack Router** to **Remix 3**
(`remix@next`, `3.0.0-beta.x`). Based on a Phase 0 spike (`npx remix@next new`)
and the bundled agent skill (`.agents/skills/remix/`).

## What Remix 3 actually is (the load-bearing facts)

- **Not React.** Its own UI runtime (`remix/ui`, `remix/ui/jsx-runtime`). React
  components, `react`, `react-dom`, and `lucide-react` do **not** carry over.
- **Server-first**, built on Web APIs (`Request`/`Response`). Runs a Node HTTP
  server (`server.ts` → `createRequestListener` → `router.fetch`). **Bundler-free**
  — `node-tsx` loads TS/JSX at runtime. **Requires Node ≥ 24.3.0** (we're on 22).
- **Interactivity = hydration islands.** `clientEntry(import.meta.url, Component)`
  ships that component's JS to the browser and hydrates it; the rest stays static
  HTML. The client runtime boots from `app/assets/entry.ts` (`run(...)`).
- **Reactivity model:** a component is `function C(handle) { return () => <jsx/> }`.
  Local `let` state in the component body, mutated inside `on('click', …)` /
  effects, re-runs the render closure. Reusable stateful logic → **`createMixin`**
  (the React-hook replacement). Styling via `mix={css({…})}` (CSS-in-JS).
- Ships an **agent skill** (`.agents/skills/remix/SKILL.md` + `references/`) —
  the canonical build guide; follow it during implementation. Fuller API docs:
  `node_modules/remix/src/<subpath>/README.md`.

## Feasibility for a Tauri desktop app

| Question | Verdict |
|---|---|
| Real-time client interactivity (MIDI, WebSocket, 60fps SVG)? | ✅ Yes — via `clientEntry` hydration islands |
| Keep `vexflow` (renders into a DOM node) / `tonal` (pure JS)? | ✅ Yes |
| Keep pure `lib/music.ts` + `lib/theory.ts` + their tests? | ✅ Logic yes; test runner changes (`remix/test` / `node --test`) |
| **Production: static bundle for the Tauri WebView?** | ⚠️ **Open** — Remix 3 is a *running server*; no obvious static export |
| Tauri **dev**? | ✅ Easy — point Tauri `devUrl` at the Remix server (`:44100`) |
| React-only deps (`lucide-react`, `@testing-library/react`, TanStack) | ❌ Removed/replaced |

**Confirmed by research (beta.4): Remix 3 has NO static export.** The CLI is
`new | doctor | routes | test | version` — there is **no `build` / `export` /
`prerender` / `static` command**. The app only runs via the Node server, and the
**asset server compiles browser modules on the fly at request time** (import
rewriting, fingerprinted URLs, prod minify). No SSG/SPA/prerender appears
anywhere in the docs or skill references.

For context, **today's ChordLens is a pure client SPA**: `main.tsx` does
`ReactDOM.createRoot(...).render(<RouterProvider/>)`, TanStack Router in plain
SPA mode (no SSR/Start), `vite build` → static `../dist`, which Tauri serves from
disk (`frontendDist: ../dist`). Remix 3 can't produce that static `dist`.

So the Tauri-as-static-SPA model **does not map** to Remix 3. Options:

1. **Node sidecar (only faithful desktop path)** — bundle Node + the Remix server
   as a Tauri [sidecar](https://v2.tauri.app/develop/sidecar/); Tauri spawns it on
   launch, WebView → `localhost:port`. Works, but: ships a Node runtime, more
   moving parts, slower startup, and loses the "static, no process" simplicity.
2. **DIY static snapshot** — run the server at build time and crawl the one route
   to save HTML + the fingerprinted asset modules to disk. Unsupported, fragile
   (dynamic/fingerprinted URLs, hydration assumptions). Not recommended.
3. **Web app, no Tauri (recommended for this project).** Remix 3 *is* a web
   framework — its natural target is a website, not a desktop static bundle. Run
   ChordLens as a **Remix web app** and get notes from either the **Max for Live
   WebSocket bridge** (already built, browser-friendly) or **Web MIDI** (works in
   Chrome — the very reason we used Rust was that the *Tauri WebView* lacks Web
   MIDI; a real browser has it). This drops Tauri *and* the Rust MIDI layer for
   the Remix version, which fits the "TanStack was overkill, go lighter" goal.

**Recommendation:** build the Remix 3 version as a **web app** (option 3). Keep
the existing Tauri/React app as-is for the native-desktop story; treat Remix 3 as
the lighter web incarnation. Revisit the Node sidecar only if a true desktop
build of the Remix version is later required.

## Concept mapping (React/TanStack → Remix 3)

| Today | Remix 3 |
|---|---|
| `react` / `react-dom`, JSX | `remix/ui` runtime + `remix/ui/jsx-runtime` (tsconfig) |
| `createRoot` / Vite SPA entry | `app/assets/entry.ts` `run(...)` + `clientEntry` islands |
| TanStack Router (`createFileRoute`, route tree) | `app/routes.ts` (`route`/`get`) + `app/actions/controller.tsx` |
| Function component + hooks | `function C(handle){ return () => jsx }`, local `let` state |
| `useState` | local `let` in the component body (mutate → re-render) |
| `useEffect` / lifecycle, `useRef` | effect/lifecycle + refs per `references/component-model.md` |
| Custom hooks (`usePushMidi`, `useAbleton`, …) | **mixins** (`createMixin`) — `references/create-mixins.md` |
| `useMemo` | derive in the render closure (or memoize in a mixin) |
| Events (`onClick`) | `on('click', …)` mixin — `references/mixins-styling-events.md` |
| Tailwind v4 + classes | `mix={css({…})}` CSS-in-JS (or a global stylesheet asset) |
| `lucide-react` icons | inline SVG components (the scaffold does this already) |
| `vitest` + `@testing-library/react` | `remix/test` + `remix/ui/test` `render`; keep pure-logic tests |
| `@tauri-apps/api` `invoke`/`listen` | unchanged — called from client-entry JS |
| VexFlow draw-in-effect | same, inside the Remix effect/ref equivalent |

## Target layout (per the scaffold's AGENTS.md)

```
app/
  routes.ts                 # route contract: { home: '/', assets: get('/assets/*path') }
  router.ts                 # createRouter + middleware (staticFiles, render)
  actions/controller.tsx    # home action -> context.render(<HomePage/>)
  middleware/render.tsx      # renderToStream HTML responses
  ui/
    document.tsx            # <html> shell + client entry <script>
    chordlens-app.tsx       # the visualizer page (was routes/index.tsx)
    piano.tsx, fretboard.tsx, push.tsx, notation.tsx, …  # ported views (clientEntry)
  music/                    # ported pure logic (was lib/music.ts, theory.ts, colors.ts, config.ts)
  midi/                     # mixins: pushMidi, ableton, keyEstimate, chordHistory
  assets/entry.ts           # client runtime boot
server.ts                   # Node server (dev) / sidecar (prod)
```
> Remix's convention discourages `app/lib/` and `app/components/` dumping
> grounds — co-locate by feature. Adapt our current `lib/`+`components/` layout.

## Phased steps

**Phase 0 — spike (done):** scaffolded, confirmed islands hydration + the API.
Remaining sub-spike: **static-export vs sidecar** for Tauri prod (decides packaging).

**Phase 1 — foundation**
- Install Node 24 (`nvm install 24 && nvm use 24`).
- `npx remix@next new` a fresh app (or add Remix into a new `chordlens-remix/`).
- Decide Tauri packaging (sidecar vs pre-render vs web-only) from the sub-spike.
- Port pure logic verbatim: `music.ts`, `theory.ts`, `colors.ts`, `config.ts`
  (+ keep their tests as the safety net).

**Phase 2 — static views (no state)**
- Port `PianoView`, `FretboardView`, `PushView`, `KeyBadge`, `StatusIndicator`,
  `InputPicker`, `ProgressionStrip`, `AbletonStatus` to `remix/ui` + `css()`.
  Replace `lucide-react` with inline SVG.
- `NotationView` + `ProgressionStaff`: keep VexFlow; draw into a ref'd element in
  the Remix effect equivalent.

**Phase 3 — stateful logic as mixins (riskiest)**
- Re-express `usePushMidi`, `useAbleton`, `useKeyEstimate`, `useChordHistory` as
  `createMixin`. Tauri `invoke`/`listen` and the WebSocket client logic move over
  unchanged; only the React state plumbing changes.

**Phase 4 — compose + hydrate**
- Rebuild the visualizer page; make it (or its interactive subtrees) a
  `clientEntry` so MIDI/WebSocket run in the browser. Wire the Tauri dev URL.

**Phase 5 — packaging + cleanup**
- Land the chosen Tauri packaging; drop React/TanStack/Vite/Tailwind deps; update
  `tsconfig` JSX to `remix/ui/jsx-runtime`; update README/architecture docs.

## Prerequisites / risks

- **Node ≥ 24.3.0** is required (current: 22.18) — install before starting.
- **Beta software** (`3.0.0-beta.4`): API churn likely; pin the version.
- **Tauri production packaging is unsolved** until the Phase 0 sub-spike — this
  is the gating risk; everything else is a mechanical (if large) rewrite.
- **Full frontend rewrite** (~2,500 LOC, 10 components + 4 hooks) in an
  unfamiliar runtime — scope accordingly; lean on `.agents/skills/remix/`.
