# Architecture — Estimate

## Chosen Stack

| Layer | Tool | Version |
|---|---|---|
| **Language** | TypeScript (strict mode) | ~6.0 |
| **UI framework** | Svelte 5 (runes) | ^5.55 |
| **Canvas** | Canvas 2D API (native) | — |
| **P2P communication** | Trystero (Nostr + MQTT dual-strategy) | ^0.23 |
| **Build** | Vite | ^8.0 |
| **Lint + Format** | Biome | ^2.4 |
| **Unit tests** | Vitest | ^4.1 |
| **Single-file output** | vite-plugin-singlefile | ^2.3 |

**Decision**: Svelte 5 was chosen over React + Konva for minimal bundle size (~2 KB runtime vs ~90 KB), zero-VDOM canvas performance, and built-in reactivity (no state library needed). See [Framework Comparison](#appendix-framework-comparison) for the full analysis.

---

## Project Structure

```
estimate/
├── src/
│   ├── App.svelte                  ← root component (session state, P2P wiring, UI)
│   ├── main.ts                     ← entry point
│   ├── components/
│   │   ├── SessionLobby.svelte     ← create/join session, user name, unit selection
│   │   └── EstimationCanvas.svelte ← canvas wrapper, pointer events, resize observer
│   └── lib/
│       ├── lognormal.ts            ← PDF math, area normalization, combine estimates
│       ├── lognormal.test.ts       ← 24 tests
│       ├── canvas.ts               ← all Canvas 2D drawing, coordinate mapping, hit testing
│       ├── canvas.test.ts          ← 15 tests
│       ├── peer.ts                 ← Trystero wrapper, dual-strategy P2P, room management
│       ├── peer.test.ts            ← 7 tests
│       └── types.ts                ← message types, peer colors
├── index.html                      ← HTML shell with Google Fonts (Caveat)
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── biome.json
├── package.json
├── PRODUCT.md                      ← product spec
└── ARCHITECTURE.md                 ← this file
```

Tests are colocated with source files (`*.test.ts` next to `*.ts`), not in a separate `tests/` directory.

---

## Key Architecture Decisions

### Dual-Strategy P2P (Nostr + MQTT)

Corporate firewalls frequently block WebSocket connections to Nostr relays. To ensure reliability:

- `peer.ts` joins **both** a Nostr room and an MQTT room simultaneously
- Peer join/leave events are deduplicated — a peer is "joined" when seen on *any* strategy, "left" only when gone from *all*
- All messages are broadcast on all connected channels via `Promise.allSettled`
- Receiving the same message from both channels is idempotent (last-write-wins)

```
┌──────────────┐     Nostr relays      ┌──────────────┐
│   Peer A     │◄─────────────────────►│   Peer B     │
│              │     MQTT broker        │              │
│              │◄─────────────────────►│              │
└──────────────┘                       └──────────────┘
```

Pinned Nostr relays: `relay.damus.io`, `nos.lol`, `purplerelay.com`, `relay.nostr.band`, `relay.snort.social`.  
MQTT uses Trystero's default HiveMQ broker.

### Canvas Drawing Architecture

All drawing logic lives in `src/lib/canvas.ts` — components never call Canvas API directly.

- `drawScene()` is the single entry point, called synchronously inside a Svelte `$effect`
- Draw order: paper background → history scribbles → axes → mode line → own blob → peer blobs (revealed) → combined blob (revealed)
- Coordinate mapping: `mathToCanvasX`/`canvasToMathX` map between math space [0, 20] and canvas pixels
- Y-axis maps sigma (certainty) via `canvasYToSigmaFromPeak` — binary search finding which sigma makes the peak reach the cursor Y
- Sketchy visual style: seeded PRNG (`mulberry32`) produces deterministic jitter for hand-drawn feel

### State Management

All session state lives as `$state` variables in `App.svelte`:

| State | Type | Description |
|---|---|---|
| `mu`, `sigma` | `number` | User's current estimate |
| `peerEstimateMap` | `Map<string, PeerEstimate>` | Peer estimates by peer ID |
| `revealed` | `boolean` | Whether estimates are visible |
| `selfReady` | `boolean` | User has clicked "Done" |
| `readyPeers` | `Set<string>` | Peer IDs that are ready |
| `history` | `HistoryEntry[]` | Past round combined estimates |
| `unit` | `string` | "points" or "days" (set by creator) |
| `isCreator` | `boolean` | Whether this user created the room |

Auto-reveal triggers via `$effect` when all participants are ready.

### P2P Message Types

Defined in `src/lib/types.ts`:

| Message | Payload | When Sent |
|---|---|---|
| `EstimateMessage` | `{ mu, sigma }` | On pointer drag, on peer join |
| `RevealMessage` | `{ revealed }` | On auto-reveal, force-reveal, or "Next" (`false`) |
| `NameMessage` | `{ name }` | On peer join |
| `TopicMessage` | `{ topic }` | On topic change |
| `ReadyMessage` | `{ ready }` | On "Done" click |
| `UnitMessage` | `{ unit }` | On peer join (creator only) |

### Combined Estimates

Uses precision-weighted Bayesian combination:

$$\sigma_\text{combined}^2 = \frac{1}{\sum_i \frac{1}{\sigma_i^2}}, \quad \mu_\text{combined} = \sigma_\text{combined}^2 \cdot \sum_i \frac{\mu_i}{\sigma_i^2}$$

More certain estimates (lower σ) get more weight. Estimates with σ ≤ 0 are filtered out.

---

## Deployment — GitHub Pages (Static)

The app is fully static. `vite build` produces a single `dist/index.html` (~470 KB, ~146 KB gzipped).

### GitHub Pages Setup

1. **Vite config**: `base: '/estimate/'` matches the repo name
2. **GitHub Actions** (`.github/workflows/deploy.yml`) builds and deploys on push to `master`
3. HTTPS is provided by GitHub Pages (required for WebRTC)

### Alternative Static Hosts

GitHub Pages, Cloudflare Pages, Netlify, Vercel — all work identically for a single static file.

---

## Build & Test

```sh
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # production build (single HTML file)
npm run check        # svelte-check (type checking)
npm run lint         # biome check
npm run test         # vitest run (46 tests)
```

---

## Appendix: Framework Comparison

> Historical context — this comparison was done before implementation. **Svelte 5 was chosen.**

### Why Svelte 5 over React + Konva?

| Criterion | React + Konva | Svelte 5 + Canvas |
|---|---|---|
| **Bundle size** | ~90 KB gzipped | ~2 KB gzipped |
| **Canvas drag** | Handled by Konva | Hand-written (~100 lines) |
| **Dependencies** | 5 (react, react-dom, konva, react-konva, zustand) | 1 (svelte) |
| **State management** | Zustand (separate lib) | Built-in runes |
| **60fps drag performance** | Good (needs care with re-renders) | Excellent (no VDOM) |

The app is **one interactive canvas** — not a complex multi-page UI where React's ecosystem shines. The hand-written Canvas drag code is a one-time cost that gives **more control** over blob physics.

### Why Not Angular or Vue?

- **Angular**: Massively over-scoped — DI, routing, forms, HTTP for a single-canvas app. Bundle 90-130 KB.
- **Vue 3**: Closest runner-up. ~33 KB bundle sits between React (ecosystem) and Svelte (minimalism) without a decisive advantage for a canvas-driven app.
