# Estimate — Copilot Instructions

## Project Overview

Real-time, peer-to-peer 2D estimation tool for agile teams. Users position a log-normal "blob" on a continuous plane (X = effort, Y = certainty). Fully serverless — P2P via WebRTC, deployed as a single static HTML file.

See [PRODUCT.md](../../PRODUCT.md) for full product spec, [ARCHITECTURE.md](../../ARCHITECTURE.md) for architecture decisions, [FMEA.md](../../FMEA.md) for risk analysis.

## Implementation Design

### Data flow (one estimation round)

```
User drags blob → handleEstimateChange(s, mu, sigma)
                    ├── updates s.mu, s.sigma, s.hasMoved
                    └── session.sendEstimate({mu, sigma})  ──P2P──►  onEstimate → peerEstimateMap

User clicks Ready → handleDone(s)
                    ├── s.selfReady = true
                    └── session.sendReady({ready:true})    ──P2P──►  onReady → readyPeers.add()
                                                                       └── $effect: checkAutoReveal()

All ready (mic holder's client):
  checkAutoReveal() → buildRevealPayload(s)
    ├── snapshots peerEstimateMap + self (excludes abstained)
    ├── computes verdict via computeVerdict()
    ├── sets s.authoritativeVerdict
    └── sendReveal({revealed:true, estimates[], verdict})  ──P2P──►  onReveal()
                                                                       ├── replaces peerEstimateMap wholesale
                                                                       └── stashes authoritativeVerdict

Next ticket (mic holder):
  handleNext(s, deps) → buildRevealPayload(s, {revealed:false})
    ├── saveRoundToHistory(s)  ← reads s.authoritativeVerdict, clears it
    ├── resetRound(s)
    └── sendReveal({revealed:false, verdict})              ──P2P──►  onReveal()
                                                                       ├── stashes verdict
                                                                       ├── saveRoundToHistory(s)
                                                                       └── resetRound(s)
```

### Transport layer

Three independent channels, all broadcasting simultaneously:
1. **WebRTC/Nostr** — Trystero signaling via Nostr relays → direct peer connections
2. **WebRTC/MQTT** — Trystero signaling via HiveMQ → direct peer connections
3. **Nostr relay** — AES-256-GCM encrypted ephemeral events (kind 25078), no WebRTC needed

`peer.ts` deduplicates: join fires on first strategy to see a peer, leave fires when all strategies drop them. Relay messages auto-discover unknown peers.

### State ownership

| Data | Owner | Synced via |
|---|---|---|
| `SessionState` (single mutable object) | `App.svelte` (created by `createInitialState()`) | — |
| All state mutations | `session-controller.ts` functions (take `s: SessionState`) | — |
| P2P callbacks | `createPeerCallbacks(s, deps)` — closures over `s` | Incoming P2P messages |
| Derived UI values (`allReady`, `holdsMic`, etc.) | `$derived` in `App.svelte` | Svelte reactivity |
| Canvas drawing | `$effect` in `EstimationCanvas.svelte` → `drawScene()` | Synchronous redraw |
| Persistence | `session-store.ts` `ScopedStorage` (localStorage, keyed by room+user) | — |
| Nostr room state | `nostr-state.ts` (kind 30078/30079 events) | Published on state changes |

### Key invariants (not enforced by types)

1. **`buildRevealPayload(s)` must be called before `saveRoundToHistory(s)`** — it sets `s.authoritativeVerdict` which `saveRoundToHistory` consumes and clears. Every code path that saves (handleNext, selectTicket with prior estimate, onReveal revealed:false) must follow this sequence.
2. **`saveRoundToHistory` never computes locally** — returns early if `authoritativeVerdict` is null. The mic holder is the single source of truth.
3. **Clone-and-reassign for Maps/Sets in P2P callbacks** — `peerEstimateMap = new Map(peerEstimateMap).set(k, v)`. Direct `.set()` only works inside Svelte's own reactive context, not in external callbacks.
4. **Only the mic holder sends reveal** — `checkAutoReveal` and `handleForceReveal` run on every client but only the mic holder's `sendReveal` is authoritative. If mic holder is stale, auto-reveal is blocked.
5. **`resetRound` clears `authoritativeVerdict` and conclusion state** — ensures stale verdicts and conclusion curves don't leak into the next round.
6. **Canvas draws synchronously in `$effect`** — never in `requestAnimationFrame`. All reactive dependencies must be read before any early return.
7. **`peerIds.length < MAX_PEERS` on join** — enforced in `onPeerJoin`; overflow peers and self-echoes are silently ignored.
8. **Prep mode blocks auto-reveal** — `checkAutoReveal` is a no-op when `s.prepMode === true`.
9. **`resetReadyState(s)` is the shared reset primitive** — used by `resetRound`, `reEstimate`, `selectTicket`, and `onReveal` reEstimate branch. Resets: `revealed`, `selfReady`, `selfAbstained`, `readyPeers`, `abstainedPeers`, `skippedPeers`, `peerEstimateMap`.
10. **`selectTicket` uses `{skipSave, skipSend}` options** — `skipSave` prevents saving current estimate to history; `skipSend` prevents sending topic to peers. `handleNext` uses `{skipSave: true}` (already saved), `onTopic` uses `{skipSave: true, skipSend: true}` (incoming P2P).
11. **`peerEstimateMap` must never contain `selfId`** — enforced by guards in `onEstimate`/`onReveal` + debug assertions in DEV mode.
12. **Name collision bounce** — `onName` detects duplicate names case-insensitively. Creator wins over non-creator; between non-creators, lower `selfId` stays. Loser is bounced via `deps.onNameConflict`.
13. **Claimed creator yields to original** — `claimCreator` sets `claimedCreator = true`. When `onName` sees `peerIsCreator: true`, a claimed creator automatically yields (`isCreator = false`) and re-broadcasts.
14. **`persistSession` excludes claimed creators** — writes `isCreator: s.isCreator && !s.claimedCreator` so claimed roles don't survive rejoin.

### Module responsibilities (quick reference)

| Module | Purpose | Key exports |
|---|---|---|
| `session-controller.ts` | Facade & P2P callback factory, session lifecycle (join/leave) | `createPeerCallbacks`, `joinSession`, `leaveSession`, `prepareJoin`, re-exports from sub-modules |
| `session-state.ts` | `SessionState`, `SessionDeps`, `createInitialState`, pure queries, persistence helpers | `SessionState`, `createInitialState`, `getCurrentTicket`, `getEstimatedCount`, `persistSession`, `publishState` |
| `session-round.ts` | Round lifecycle: reset, reveal, verdict, estimation actions | `resetReadyState`, `resetRound`, `handleDone`, `handleAbstain`, `checkAutoReveal`, `buildRevealPayload`, `saveRoundToHistory` |
| `session-backlog.ts` | Backlog management: ticket navigation, import/merge, reorder/remove, meeting mode | `selectTicket`, `handleNext`, `processBacklogImport`, `startMeeting`, `returnToPrep` |
| `session-participants.ts` | Participant queries, mic/backlog claiming, unit management | `getAllParticipants`, `hasMic`, `handOffMic`, `takeMicBack`, `claimMic`, `claimCreator`, `changeUnit`, `buildParticipantsData` |
| `peer.ts` | Transport layer: 3-strategy P2P, message senders, heartbeat, dedup | `createSession`, `selfId`, `PeerSession`, `PeerCallbacks` |
| `nostr-relay.ts` | Encrypted Nostr relay channel (AES-256-GCM, kind 25078) | `createNostrRelay`, `isRelayEnvelope` |
| `types.ts` | Message shapes, `VerdictSnapshot`, `PeerEstimate`, `SceneState` | All message types |
| `lognormal.ts` | PDF/CDF math, quantiles, combine estimates, snap verdicts | `lognormalPdf`, `combineEstimates`, `snapVerdict` |
| `canvas.ts` | Drawing facade: `drawScene()` entry point, coordinate transforms | `drawScene`, `mathToCanvasX`, `canvasYToSigmaFromPeak` |
| `verdict.ts` | Pure verdict computation, history upsert | `computeVerdict`, `applyVerdict`, `upsertHistory` |
| `session-store.ts` | localStorage: sessions, scoped pre-estimates/verdicts/backlog | `ScopedStorage`, `saveSession`, `setStorageQuotaHandler` |
| `nostr-state.ts` | Nostr event persistence (replaceable events kind 30078/30079) | `publishRoomState`, `queryRoomState` |
| `crypto.ts` | AES-256-GCM encrypt/decrypt, HKDF key derivation, d-tag hash | `deriveRoomKey`, `encrypt`, `decrypt`, `computeDTag` |
| `config.ts` | Constants: relay URLs, app ID, `MAX_PEERS`, room ID generator | `NOSTR_RELAY_URLS`, `MAX_PEERS`, `generateRoomId` |

## Tech Stack

| Layer | Tool |
|---|---|
| Language | TypeScript (strict mode) |
| UI framework | Svelte 5 (runes: `$state`, `$derived`, `$effect`) |
| Canvas | Canvas 2D API (native, no wrapper library) |
| P2P | Trystero (WebRTC: Nostr + MQTT) + Nostr relay fallback |
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
- Session logic is split into focused modules behind a **facade**:
  - `session-controller.ts` — facade & P2P callback factory + session lifecycle; re-exports all public API from sub-modules
  - `session-state.ts` — `SessionState`, `SessionDeps`, `createInitialState`, pure queries (`getCurrentTicket`, `getEstimatedCount`), persistence helpers
  - `session-round.ts` — round lifecycle: reset, reveal, verdict, estimation actions (`handleDone`, `handleAbstain`, `checkAutoReveal`, etc.)
  - `session-backlog.ts` — backlog management: ticket navigation, import/merge, reorder/remove, meeting mode transitions
  - `session-participants.ts` — participant queries, mic/backlog claiming, unit management
  - Components import only from `session-controller.ts` — never from sub-modules directly
- Keep log-normal math in `src/lib/lognormal.ts` — pure functions, easily testable
- P2P wrapper in `src/lib/peer.ts` — triple-transport (WebRTC/Nostr + WebRTC/MQTT + Nostr relay), isolates transport from the rest of the app
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
- Backlog ownership (`isCreator`) can be claimed via `claimCreator()` when no creator peer is present; claimed role auto-yields when original returns
- Sketchy visual style uses seeded PRNG (`mulberry32`) for deterministic jitter — same seed = same hand-drawn look

## Design Hygiene

Every commit should leave the codebase in a better state. Follow these rules to avoid accumulating debt that requires big refactoring passes.

### Keep instructions current
- When a commit changes architecture, modules, conventions, test count, or key invariants, update this file in the same commit.
- Module table, test count, data flow diagram, and key invariants must reflect the actual code.

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
npm run test         # vitest run (445+ tests)
```

## Deployment

Static site — GitHub Pages via GitHub Actions. No server required. See ARCHITECTURE.md for workflow details.
