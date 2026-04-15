# Estimate — Copilot Instructions

## Project Overview

Real-time, peer-to-peer 2D estimation tool for agile teams. Users position a log-normal "blob" on a continuous plane (X = effort, Y = certainty). Fully serverless — P2P via WebRTC, deployed as a single static HTML file.

See [PRODUCT.md](../../PRODUCT.md) for full product spec, [ARCHITECTURE.md](../../ARCHITECTURE.md) for architecture decisions.

## Tech Stack

| Layer | Tool |
|---|---|
| Language | TypeScript (strict mode) |
| UI framework | Svelte 5 (runes: `$state`, `$derived`, `$effect`) |
| Canvas | Canvas 2D API (native, no wrapper library) |
| P2P | Trystero (WebRTC, dual-strategy: Nostr + MQTT) |
| Build | Vite |
| Lint + Format | Biome |
| Unit tests | Vitest |
| Single-file output | vite-plugin-singlefile |

## Code Style

- Svelte 5 runes only — no legacy `$:` reactive statements, no `writable()`/`readable()` stores
- Prefer `$state`, `$derived`, `$effect` for all reactivity
- Use TypeScript strict mode — no `any`, no `@ts-ignore`
- Prefer `interface` over `type` for object shapes (exception: Trystero message payloads use `type` — Trystero's generic constraints require it)
- Use named exports, no default exports
- File naming: `kebab-case.ts` for lib files, `PascalCase.svelte` for components

## Architecture

- `src/components/` — Svelte components (UI layer)
- `src/lib/` — Pure TypeScript modules (math, P2P, types)
- Tests colocated: `src/lib/*.test.ts` next to source files
- Canvas drawing is split into focused modules behind a **facade**:
  - `canvas.ts` — facade & scene drawing (`drawScene()` is the single entry point); re-exports all public API from sub-modules
  - `canvas-coords.ts` — coordinate transforms, config, hit-testing, blob geometry
  - `canvas-sketchy.ts` — sketchy visual primitives (`sketchyEllipse`, `createHatchPattern`, `drawSketchyArrow`)
  - Components import only from `canvas.ts` — never from sub-modules directly
- Keep log-normal math in `src/lib/lognormal.ts` — pure functions, easily testable
- P2P wrapper in `src/lib/peer.ts` — dual-strategy (Nostr + MQTT simultaneously), isolates Trystero API from the rest of the app
- All session state lives as `$state` in `App.svelte` — no external state library

## Conventions

- All P2P message types must be defined in `src/lib/types.ts` (EstimateMessage, RevealMessage, NameMessage, TopicMessage, ReadyMessage, UnitMessage)
- State shared across components lives in Svelte `$state` at the top-level component, passed via props or context — no external state library
- Canvas redraw triggered via `$effect` watching reactive state — draw **synchronously** in the effect, not inside `requestAnimationFrame` (avoids race conditions with ResizeObserver)
- In `$effect`, read all reactive values **before** any async boundary — Svelte only tracks synchronous reads
- Use pointer events (`pointerdown`, `pointermove`, `pointerup`) not mouse events — supports touch
- Canvas buffer size set imperatively (`canvas.width = w`) in the draw effect, **not** via HTML attributes — prevents layout feedback loops
- ResizeObserver should observe the **container div**, not the canvas itself
- Svelte 5 tracks `Map.set()`/`Map.delete()`/`Set.add()` mutations directly only within Svelte's own reactive context; mutations inside **external callbacks** (P2P, WebSocket, setTimeout) require clone-and-reassign: `map = new Map(map).set(k, v)`
- Unit selection (points/days) is set by creator only; joiners receive it via P2P — use `isCreator` flag to guard
- Sketchy visual style uses seeded PRNG (`mulberry32`) for deterministic jitter — same seed = same hand-drawn look

## Design Hygiene

Every commit should leave the codebase in a better state. Follow these rules to avoid accumulating debt that requires big refactoring passes.

### Module size
- **Source files > ~300 lines** are a smell. Split into focused sub-modules behind a re-export facade (see canvas.ts pattern).
- **Components > ~300 lines of template** likely need extraction. Pull repeated or self-contained blocks into child components or Svelte 5 `{#snippet}`s.
- Test files can be larger — they're linear and don't need abstraction.

### Don't duplicate — extract immediately
- **Same 3+ lines appearing twice?** Extract a named helper function on the spot (e.g. `collectEstimates()`, `sketchyEllipse()`). Don't wait for a cleanup pass.
- **Same template block in two `{#if}` branches?** Use a `{#snippet}` within the component.
- **Same UI widget in two components?** Extract a shared `.svelte` component with a typed `Props` interface.
- **Same CSS block in 3+ components?** Promote to a global utility class in `index.html` (e.g. `.overlay`).

### CSS custom properties
- All visual values (colors, spacing, font sizes, radii, shadows, transitions) must use design tokens from `:root` in `index.html`. Never use raw hex colors, pixel values, or magic numbers in component CSS.
- Token naming: `--c-*` (colors), `--fs-*` (font sizes), `--sp-*` (spacing), `--radius-*`, `--shadow-*`, `--tr-*` (transitions).
- Per-instance dynamic values (e.g. peer colors) use scoped inline custom properties like `--peer-color`.

### Component design
- Reusable components get a typed `interface Props` and use `$props()` for destructuring.
- Components never call Canvas 2D API directly — all drawing goes through `canvas.ts`.
- Overlay/modal components use the global `.overlay` class; override only `z-index` when needed.

### Accessibility & input
- Use `pointer` events (not `mouse`) for touch support.
- Interactive elements need `:focus-visible` styles.
- Animations respect `prefers-reduced-motion` (tokens already zero out `--tr-*`).

## Build & Test

```sh
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # production build (single HTML file)
npm run check        # svelte-check (type checking)
npm run lint         # biome check
npm run test         # vitest run (375+ tests)
```

## Deployment

Static site — GitHub Pages via GitHub Actions. No server required. See ARCHITECTURE.md for workflow details.
