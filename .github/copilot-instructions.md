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
- Keep **all** Canvas 2D drawing logic in `src/lib/canvas.ts` (including mode-line, combined blob, axes, history scribbles) — components never call Canvas API directly
- `drawScene()` is the single entry point for all canvas rendering
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
- Svelte 5 tracks `Map.set()`/`Map.delete()`/`Set.add()` mutations directly — no need to clone-and-reassign
- Unit selection (points/days) is set by creator only; joiners receive it via P2P — use `isCreator` flag to guard
- Sketchy visual style uses seeded PRNG (`mulberry32`) for deterministic jitter — same seed = same hand-drawn look

## Build & Test

```sh
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # production build (single HTML file)
npm run check        # svelte-check (type checking)
npm run lint         # biome check
npm run test         # vitest run (65 tests)
```

## Deployment

Static site — GitHub Pages via GitHub Actions. No server required. See ARCHITECTURE.md for workflow details.
