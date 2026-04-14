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
│   │   ├── EstimationCanvas.svelte ← canvas wrapper, pointer events, resize observer
│   │   └── BacklogPanel.svelte     ← collapsible sidebar with ticket list
│   └── lib/
│       ├── lognormal.ts            ← PDF math, CDF/quantile, area normalization, combine estimates
│       ├── lognormal.test.ts       ← 40 tests
│       ├── canvas.ts               ← all Canvas 2D drawing, annotations, coordinate mapping, hit testing
│       ├── canvas.test.ts          ← 24 tests
│       ├── csv.ts                  ← CSV/Excel import/export (flexible column matching)
│       ├── csv.test.ts             ← 26 tests
│       ├── peer.ts                 ← Trystero wrapper, dual-strategy P2P, room management
│       ├── peer.test.ts            ← 7 tests
│       ├── session-store.ts        ← localStorage: session persistence, verdict history
│       ├── session-store.test.ts   ← 19 tests
│       ├── verdict.ts              ← verdict computation, history upsert (pure functions)
│       ├── verdict.test.ts         ← 11 tests
│       └── types.ts                ← message types, SceneState, HistoryEntry, peer colors
├── example-backlog.csv             ← sample CSV for testing import
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
- Draw order: paper background → history scribbles → axes → mode line → own blob → annotations (pre-reveal) → peer blobs (revealed) → combined blob + annotations (revealed)
- Coordinate mapping: `mathToCanvasX`/`canvasToMathX` map between math space [0, 20] and canvas pixels
- Y-axis maps sigma (certainty) via `canvasYToSigmaFromPeak` — binary search finding which sigma makes the peak reach the cursor Y
- Sketchy visual style: seeded PRNG (`mulberry32`) produces deterministic jitter for hand-drawn feel
- Annotations: `drawAnnotations()` shows median and P10–P90 range with elastic arrows (bow scales quadratically with distance) and dashed vertical range lines. Labels are semi-anchored to the chart center, creating a rubber-band drag feel as the blob moves

### Session Persistence

Recent sessions are stored in `localStorage` via `src/lib/session-store.ts`:

- Up to 10 sessions saved, sorted by most recent
- Each session records: room ID, user name, topic, unit, peer names, creator flag
- The lobby displays saved sessions as clickable room cards for quick rejoin
- Last-used user name is pre-filled in the name input

### State Management

All session state lives as `$state` variables in `App.svelte`:

| State | Type | Description |
|---|---|---|
| `mu`, `sigma` | `number` | User's current estimate |
| `peerEstimateMap` | `Map<string, PeerEstimate>` | Peer estimates by peer ID |
| `revealed` | `boolean` | Whether estimates are visible |
| `selfReady` | `boolean` | User has clicked "Ready" |
| `readyPeers` | `Set<string>` | Peer IDs that are ready |
| `history` | `HistoryEntry[]` | Current-session combined estimates |
| `persistentHistory` | `HistoryEntry[]` | Cross-session verdicts from localStorage |
| `unit` | `string` | "points" or "days" (set by creator) |
| `isCreator` | `boolean` | Whether this user created the room |
| `backlog` | `EstimatedTicket[]` | Imported ticket list |
| `backlogIndex` | `number` | Currently selected ticket (-1 = none) |
| `myEstimates` | `Map<string, Estimate>` | Personal estimates per ticket ID |
| `prepMode` | `boolean` | Solo prep mode vs meeting mode |
| `showPersistentHistory` | `boolean` | Toggle for cross-session history scribbles |

Auto-reveal triggers via `$effect` when all participants are ready.

### P2P Message Types

Defined in `src/lib/types.ts`:

| Message | Payload | When Sent |
|---|---|---|
| `EstimateMessage` | `{ mu, sigma }` | On pointer drag, on peer join |
| `RevealMessage` | `{ revealed }` | On auto-reveal, force-reveal, or "Next" (`false`) |
| `NameMessage` | `{ name }` | On peer join |
| `TopicMessage` | `{ topic, url?, ticketId? }` | On topic change, on ticket select |
| `ReadyMessage` | `{ ready }` | On "Ready" click |
| `UnitMessage` | `{ unit }` | On peer join (creator only) |
| `BacklogMessage` | `{ tickets }` | On backlog import (creator → peers) |

### Backlog & Prep Mode

The creator can import a CSV backlog (`src/lib/csv.ts` with flexible column matching for Jira/GitHub/generic formats). The flow:

1. **Import** → `prepMode` activates. Creator goes through tickets solo, placing estimates.
2. **Personal estimates** are saved per ticket in a `myEstimates` Map and restored on re-selection.
3. **P2P sync** → backlog is broadcast to peers via `BacklogMessage`. Peers enter prep mode too.
4. **Meeting mode** → Creator clicks "Start meeting". Ready/Reveal flow resumes for consensus.
5. **Verdict recording** → `verdict.ts` computes combined estimate, applies to `EstimatedTicket`, records in session and persistent history.
6. **Export** → CSV or Excel (XML Spreadsheet 2003 format, no binary dependency) download.

### Persistent History

Verdicts are stored in `localStorage` via `session-store.ts` (`estimate-history` key, max 50 entries). On session join, persistent history is loaded filtered by unit. Rendered on canvas as faded scribbles (`0.5` alpha, 13px) under the brighter current-session scribbles (`0.75` alpha, 15px). Toggleable via "Past" checkbox in the header.

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
npm run test         # vitest run (127 tests)
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
