# Architecture Options — Estimate

## Why Not Angular or Vue?

Both are mature, well-supported frameworks — but they're a poor fit for **this specific product**:

### Angular

- **Massively over-scoped.** Angular is a full application platform (DI, routing, forms, HTTP client, i18n, animations). This app is a single canvas with a lobby screen. Using Angular here is like driving a bus to the corner shop.
- **Bundle size.** Angular's minimum viable bundle is ~90-130 KB gzipped — comparable to React but without a canvas library like Konva in the Angular ecosystem. You'd still hand-write canvas code, but with a far heavier framework around it.
- **Steeper learning curve.** Decorators, modules (or standalone components), zones (or signals), RxJS, dependency injection — the conceptual surface area is the largest of any major framework. Overkill when the entire app state is `{mu, sigma, peers, revealed}`.
- **Single-file output.** Angular's build pipeline is complex and opinionated. Getting a clean, inlined single HTML file is harder than with Vite-based tooling.

### Vue 3

Vue is actually the closest runner-up and a reasonable choice. It's excluded for narrower reasons:

- **Canvas story.** Vue's reactive system (like React's) operates on the DOM/virtual DOM. For a 60fps canvas drag interaction, you still bypass the template layer and use the Canvas API directly — meaning Vue's core value proposition (reactive templates) goes largely unused.
- **Ecosystem middle ground.** Vue's ecosystem is smaller than React's but larger than Svelte's. For this app, you need either React's massive library depth (Konva bindings, etc.) or Svelte's near-zero runtime — Vue sits in between without a decisive advantage.
- **Bundle size (~33 KB gzipped)** is lighter than React but 16× heavier than Svelte's ~2 KB. Since the app is canvas-driven (not template-driven), the extra framework weight buys little.
- **Composition API + `ref()`/`reactive()`** works well but is marginally more verbose than Svelte 5's runes for the same reactivity patterns.

In short: Angular solves problems this app doesn't have. Vue is solid but doesn't offer a compelling advantage over React (for ecosystem) or Svelte (for minimalism) given that the core UI is a `<canvas>`, not a component tree.

---

## Shared Foundation

Both options share these tools — they're the uncontroversial best-in-class choices:

| Concern | Tool | Why |
|---|---|---|
| **Build / Dev server** | [Vite](https://vitejs.dev/) | Near-instant HMR, native TS/ESM support, massive ecosystem. De facto standard. |
| **Language** | TypeScript (strict mode) | Required by brief. Catches shape-math bugs before runtime. |
| **P2P communication** | [Trystero](https://github.com/nicedream/trystero) | Serverless WebRTC, multiple signaling backends (Nostr, BitTorrent, MQTT). ~4 KB. Already identified in PRODUCT.md. |
| **Linting + Formatting** | [Biome](https://biomejs.dev/) | Single tool replaces ESLint + Prettier. Fast (Rust-based), zero-config TS support, one dependency. |
| **Unit tests** | [Vitest](https://vitest.dev/) | Vite-native, Jest-compatible API, blazing fast. |
| **E2E tests** | [Playwright](https://playwright.dev/) | Cross-browser, reliable, first-class TS. Introduced post-MVP. |
| **Single-file output** | [vite-plugin-singlefile](https://github.com/nicedream/vite-plugin-singlefile) | Inlines all JS/CSS into one HTML file — preserves the PRODUCT.md goal. |

---

## Option A: React + Konva — "Maximum Ecosystem"

### Stack

| Layer | Tool | Size (gzip) |
|---|---|---|
| UI framework | **React 19** | ~44 KB |
| Canvas interaction | **react-konva** (Konva) | ~45 KB |
| State management | **Zustand** | ~1 KB |

**Total framework footprint: ~90 KB gzipped**

### Why This Combination

1. **React** — The single most popular UI framework. Largest hiring pool, most tutorials, best AI copilot support. TypeScript is first-class.

2. **react-konva** — Declarative React bindings for the Konva canvas library. Gives you **drag-and-drop**, **hit detection**, **layering**, and **shape rendering** out of the box — exactly the primitives this app needs. Instead of manually tracking mouse coordinates and redrawing canvas, you write:
   ```tsx
   <Shape
     sceneFunc={(ctx, shape) => drawLogNormal(ctx, mu, sigma)}
     draggable
     onDragMove={(e) => updateEstimate(e.target.x(), e.target.y())}
   />
   ```

3. **Zustand** — Minimal state manager (~1 KB). Perfect bridge between Trystero's P2P messages and React's render cycle. A single store holds all peer estimates; Trystero callbacks write to it, React components subscribe to slices.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  React Component Tree                               │
│                                                     │
│  <App>                                              │
│    <SessionLobby />      ← join/create session      │
│    <EstimationCanvas>    ← Konva Stage              │
│      <Layer>                                        │
│        <MyBlob />        ← draggable, log-normal    │
│        <PeerBlob />[]    ← revealed peer blobs      │
│        <AxisLabels />                               │
│      </Layer>                                       │
│    </EstimationCanvas>                              │
│    <Controls />          ← reveal button, item name │
│  </App>                                             │
│                                                     │
├──────────────────────┬──────────────────────────────┤
│   Zustand Store      │   Trystero Room              │
│                      │                              │
│  myEstimate: {μ,σ}   │  onPeerJoin() → addPeer()   │
│  peers: Map<id,est>  │  onPeerLeave() → removePeer()│
│  revealed: boolean   │  onData() → updatePeer()     │
│  sessionName: string │  send() ← called on drag     │
└──────────────────────┴──────────────────────────────┘
```

### Pros

- Largest ecosystem — any problem you hit has a Stack Overflow answer
- react-konva handles the hardest UI problem (interactive canvas with drag + shapes) declaratively
- Zustand is trivial to learn (5-minute API)
- Can reuse React knowledge for any future UI work (settings panels, stats views)

### Cons

- Larger bundle (~90 KB) — still fine, but not "single file that loads instantly on 3G"
- React's re-render model requires care with high-frequency drag updates (solvable with `useMemo` / Konva's own batching)
- More boilerplate than compiled frameworks

---

## Option B: Svelte 5 + Canvas API — "Minimal & Compiled"

### Stack

| Layer | Tool | Size (gzip) |
|---|---|---|
| UI framework | **Svelte 5** | ~2 KB runtime |
| Canvas interaction | **Canvas 2D API** (native) | 0 KB |
| State management | Svelte runes (`$state`, `$derived`) | built-in |

**Total framework footprint: ~2 KB gzipped**

### Why This Combination

1. **Svelte 5** — Compiles components to minimal imperative JS. The ~2 KB runtime is 45× smaller than React. TypeScript is fully supported. Svelte 5's **runes** (`$state`, `$derived`, `$effect`) give you fine-grained reactivity with zero boilerplate — no state library needed.

2. **Canvas 2D API directly** — For a math-heavy, single-canvas app, the native API gives full control. You write the `drawLogNormal()` function once and call it in a `requestAnimationFrame` loop. Mouse/touch tracking is straightforward because there's only one interactive element (the blob).

3. **No state library** — Svelte's built-in reactivity replaces Zustand entirely:
   ```svelte
   <script lang="ts">
     let mu = $state(2.0);
     let sigma = $state(0.5);
     let peers = $state(new Map<string, Estimate>());
     // Trystero callbacks write to peers directly — Svelte reacts.
   </script>
   ```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  Svelte Component Tree                              │
│                                                     │
│  <App>                                              │
│    <SessionLobby />      ← join/create session      │
│    <EstimationCanvas>    ← <canvas> + rAF loop      │
│      bind:this={canvas}                             │
│      onpointermove={handleDrag}                     │
│    </EstimationCanvas>                              │
│    <Controls />          ← reveal button, item name │
│  </App>                                             │
│                                                     │
├──────────────────────┬──────────────────────────────┤
│   Svelte $state      │   Trystero Room              │
│                      │                              │
│  mu, sigma           │  onPeerJoin() → peers.set()  │
│  peers: Map          │  onPeerLeave() → peers.del() │
│  revealed: boolean   │  onData() → peers.set()      │
│  sessionName: string │  send() ← called on drag     │
│                      │                              │
│   $effect(() => {    │                              │
│     drawCanvas(...)  │   ← redraws when any         │
│   })                 │     reactive value changes    │
└──────────────────────┴──────────────────────────────┘
```

### Pros

- Tiny output — the single HTML file will be genuinely small (~50 KB total with Trystero)
- No virtual DOM overhead — drag updates go straight to canvas, zero framework tax
- Built-in reactivity means fewer concepts to learn and zero extra dependencies
- Svelte's learning curve is famously gentle; reads like enhanced HTML
- `$effect` naturally bridges Trystero events → canvas redraws

### Cons

- Smaller ecosystem than React — fewer third-party component libraries
- Canvas interaction (drag, hit testing) must be hand-written — no Konva equivalent
- Fewer developers know Svelte (though it's growing fast)
- Less AI copilot training data than React (marginal concern)

---

## Head-to-Head

| Criterion | Option A (React + Konva) | Option B (Svelte + Canvas) |
|---|---|---|
| **Bundle size** | ~90 KB | ~2 KB + app code |
| **Learning curve** | Low (React is ubiquitous) | Low (Svelte is simpler, but less known) |
| **Canvas drag interaction** | Handled by Konva | Hand-written (~100 lines) |
| **Dependencies** | 5 (react, react-dom, konva, react-konva, zustand) | 1 (svelte) |
| **State management** | Zustand (separate lib) | Built-in runes |
| **TypeScript DX** | Excellent | Excellent |
| **Community size** | Massive | Medium (growing) |
| **Single-file friendliness** | Good (with plugin) | Excellent (tiny output) |
| **Performance at 60fps drag** | Good (needs care with re-renders) | Excellent (no VDOM) |
| **Post-MVP extensibility** | More component libraries available | Leaner, but fewer ready-made parts |

---

## My Recommendation

**Option B (Svelte 5)** aligns best with this specific product:

- The app is **one interactive canvas** — not a complex multi-page UI where React's ecosystem shines
- **Bundle size matters** — the single-file goal benefits from 2 KB vs. 90 KB of framework
- **Drag performance** — no virtual DOM means `pointermove` → canvas redraw at 60fps with zero framework overhead
- **Fewer dependencies** = fewer things to break, audit, or update
- The hand-written Canvas drag code (~100 lines) is a one-time cost that actually gives you **more control** over the blob physics

Option A is the safer choice if the team already knows React and wants the Konva shortcut for drag interactions.

---

## Roadmap: Technology Introduction by Phase

### Phase 1 — MVP (Core Estimation)

```
Tools introduced:
  ✦ Vite           — project scaffolding, dev server, TS compilation
  ✦ TypeScript     — strict mode from day one
  ✦ Biome          — linting + formatting from first commit
  ✦ Svelte 5       — (or React 19 + Konva + Zustand)
  ✦ Trystero        — P2P session creation and data sync
  ✦ Vitest         — unit tests for log-normal math functions
  ✦ vite-plugin-singlefile — produces the distributable HTML

Deliverables:
  • 2D canvas with draggable log-normal blob
  • Fixed-area constraint rendering
  • P2P session join via room code
  • Hidden estimates → facilitator reveal
  • Overlaid team blobs after reveal
```

### Phase 2 — Polish & Mobile

```
Tools introduced:
  ✦ Playwright     — E2E tests (multi-browser, simulates two peers)
  ✦ qrcode (lib)   — QR code generation for session sharing (~3 KB)

Deliverables:
  • Touch interaction (mobile-friendly drag)
  • Composite "team distribution" contour overlay
  • Statistics panel (mean, median, spread, agreement score)
  • Re-estimation rounds
  • QR code session sharing
  • Accessibility: patterns/labels for color-blind users
```

### Phase 3 — Export & Integration

```
Tools introduced:
  ✦ None new — use built-in APIs

Deliverables:
  • Export results (JSON/CSV via Blob API)
  • Optional Fibonacci-scale mapping for Jira compat
  • Named reference points on X-axis (calibration anchors)
  • PWA manifest (offline support via service worker)
```

### Dependency Count Over Time

```
Phase 1:  5 production deps (framework + trystero + vite-plugin)
Phase 2:  6 production deps (+qrcode)
Phase 3:  6 production deps (no new deps)
```

This keeps the project lean throughout its life. The heaviest dependency (Trystero at ~4 KB) is also the one providing the most irreplaceable value.

---

## Deployment — GitHub Pages (Static)

The app is fully static (no server). After `vite build`, the `dist/` folder contains a single `index.html` that can be hosted anywhere.

### GitHub Pages Setup

1. **Configure Vite** for the repo's base path:
   ```ts
   // vite.config.ts
   export default defineConfig({
     base: '/estimate/',  // matches GitHub repo name
     plugins: [singleFile()],
   });
   ```

2. **Add a GitHub Actions workflow** (`.github/workflows/deploy.yml`):
   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [main]

   permissions:
     contents: read
     pages: write
     id-token: write

   concurrency:
     group: pages
     cancel-in-progress: true

   jobs:
     deploy:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 22
             cache: npm
         - run: npm ci
         - run: npm run build
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

3. **Enable Pages** in repo settings → Pages → Source: "GitHub Actions".

Every push to `main` builds and deploys automatically. The site is available at `https://<user>.github.io/estimate/`.

### Why It Works

| Concern | How it's handled |
|---|---|
| **HTTPS** | GitHub Pages serves over HTTPS by default — required for WebRTC |
| **No server logic** | All P2P communication uses Trystero's public signaling infrastructure (BitTorrent/Nostr relays) |
| **Single-file output** | `vite-plugin-singlefile` inlines everything into `index.html` — one file to serve |
| **Custom domain** | Optional: add a `CNAME` file to `dist/` and configure DNS |

### Alternative Static Hosts

All work identically (no config differences beyond base path):

| Host | Free tier | Notes |
|---|---|---|
| **GitHub Pages** | Unlimited for public repos | Tied to GitHub; simplest if repo is already there |
| **Cloudflare Pages** | Unlimited sites, bandwidth | Fastest global CDN; auto-deploys from GitHub |
| **Netlify** | 100 GB bandwidth/mo | Slightly more features (redirects, functions) |
| **Vercel** | 100 GB bandwidth/mo | Same; overkill for a static file |

---

## Project Structure (Option B — Svelte)

```
estimate/
├── src/
│   ├── app.svelte              ← root component
│   ├── main.ts                 ← entry point
│   ├── components/
│   │   ├── SessionLobby.svelte ← create/join session
│   │   ├── EstimationCanvas.svelte ← canvas + blob interaction
│   │   └── Controls.svelte     ← reveal, item name, settings
│   ├── lib/
│   │   ├── lognormal.ts        ← PDF math, area normalization
│   │   ├── canvas.ts           ← drawing functions, blob renderer
│   │   ├── peer.ts             ← Trystero wrapper, P2P state
│   │   └── types.ts            ← shared TypeScript interfaces
│   └── tests/
│       ├── lognormal.test.ts
│       └── peer.test.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── biome.json
├── package.json
└── PRODUCT.md
```

## Project Structure (Option A — React)

```
estimate/
├── src/
│   ├── App.tsx                 ← root component
│   ├── main.tsx                ← entry point
│   ├── components/
│   │   ├── SessionLobby.tsx    ← create/join session
│   │   ├── EstimationCanvas.tsx ← Konva Stage + Layers
│   │   ├── Blob.tsx            ← log-normal shape component
│   │   └── Controls.tsx        ← reveal, item name, settings
│   ├── lib/
│   │   ├── lognormal.ts        ← PDF math, area normalization
│   │   ├── peer.ts             ← Trystero wrapper
│   │   ├── store.ts            ← Zustand store
│   │   └── types.ts            ← shared TypeScript interfaces
│   └── tests/
│       ├── lognormal.test.ts
│       └── store.test.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── biome.json
├── package.json
└── PRODUCT.md
```
