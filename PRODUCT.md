# Estimate — 2D Continuous Estimation Tool

## Vision

A real-time, peer-to-peer estimation tool for agile teams that replaces discrete card-based planning poker with a **two-dimensional continuous input**:

- **X-axis (Estimate):** Unscaled effort/size — left is small, right is large
- **Y-axis (Certainty):** How confident the estimator is — bottom is uncertain, top is certain

The user doesn't place a single point. Instead, they are given a **fixed-area shape** (a "blob") that they position on the 2D plane. The shape is drawn from a **log-normal distribution**, reflecting how software estimates actually behave: bounded at zero, right-skewed, with a long tail for overruns.

### The Fixed-Area Constraint

The blob's area is constant. This enforces a fundamental trade-off:

- **High certainty** → tall, narrow blob (tight estimate range)
- **Low certainty** → short, wide blob (broad estimate range)
- The blob is **asymmetric** — the right tail extends further than the left, because "it could take 3× longer" is far more realistic than "it could take ⅓ the time"

Mathematically, if effort follows $\text{LogNormal}(\mu, \sigma^2)$:

- The mode (peak) sits at $e^{\mu - \sigma^2}$, **left** of the mean $e^{\mu + \sigma^2/2}$
- The user controls $\mu$ (horizontal position = estimate) and $\sigma$ (vertical position = certainty, inversely mapped)
- The rendered shape is the PDF scaled so its visual area remains constant

---

## Comparison with Existing Solutions

| Feature | **Estimate (this tool)** | **Planning Poker Online** | **Pointing Poker** | **PlanITPoker** |
|---|---|---|---|---|
| **Estimate type** | Continuous 2D (effort + certainty) | Discrete cards (Fibonacci / T-shirt) | Discrete cards (Fibonacci) | Discrete cards (Fibonacci / custom) |
| **Certainty captured** | Yes — first-class axis | No | No | No |
| **Distribution model** | Log-normal (reflects real estimation behavior) | None | None | None |
| **Reveals anchoring bias** | Yes — continuous input + simultaneous reveal | Partially — cards hidden until flip | Partially — cards hidden until flip | Partially — cards hidden until flip |
| **Infrastructure** | Serverless (P2P via WebRTC) | Centralized server | Centralized server | Centralized server |
| **Account required** | No | Optional (free tier limited) | No | Optional |
| **Cost** | Free / open-source | Free tier (9 votes/game), €30/mo premium | Free (ad-supported) | Free tier, paid plans |
| **Jira / issue tracker integration** | Not initially | Jira, Linear, GitHub, Azure DevOps | No | Jira (XML/CSV import) |
| **Max players** | Limited by P2P mesh (practical: ~10-15) | Unlimited | Unlimited | Unlimited |
| **Data persistence** | Session-only (no server) | Server-stored history (premium) | None | Server-stored |
| **Open source** | Yes | No | No | No |

### What Existing Tools Get Right

- **Simplicity**: Join via link, no install, no signup — Pointing Poker excels here (83M+ votes cast)
- **Simultaneous reveal**: All tools enforce hidden-then-reveal to prevent anchoring bias
- **Fibonacci spacing**: The non-linear scale acknowledges that precision decreases with size

### What Existing Tools Miss

1. **No certainty signal**: A "5" from someone who's done the exact task before and a "5" from someone guessing are treated identically
2. **Forced discretization**: The jump from 8→13 (62% increase) loses information; continuous estimation preserves nuance
3. **Symmetric assumption**: Card decks imply equal risk of over/under-estimation; real effort distributions are right-skewed
4. **No visual consensus**: Overlaying continuous blobs immediately shows agreement vs. divergence — far richer than "3 people said 5, 2 said 8"
5. **Server dependency**: Every major tool requires a centralized server, creating cost, privacy, and availability concerns

---

## User Experience

### Session Flow

```
1. Creator opens the app → generates a session ID (short code or QR)
2. Team members join via link/code → P2P mesh established
3. Facilitator names the item to estimate
4. Each participant drags their blob on the 2D canvas:
   - Horizontal position = effort estimate
   - Vertical position = certainty (controls blob width inversely)
   - The blob reshapes in real-time as they drag
5. Estimates are hidden until facilitator triggers "reveal"
6. All blobs appear simultaneously, overlaid on the same canvas
7. Team discusses — visual overlap/divergence drives the conversation
8. Optional: re-estimate after discussion
```

### Visual Design

- **During estimation**: Each user sees only their own blob on the canvas
- **After reveal**: All blobs overlaid with distinct colors, plus a composite "team estimate" contour
- The composite view immediately answers:
  - Do we agree? (blobs cluster)
  - Who's uncertain? (wide blobs)
  - Who's an outlier? (isolated blobs)
  - Is there a subgroup split? (bimodal clustering)

### Interaction Model

The user interacts by **dragging a single control point**:

- **Horizontal drag** → moves the estimate (μ)
- **Vertical drag** → adjusts certainty (σ inversely mapped)
- The blob morphs continuously: moving up makes it tall and narrow, moving down makes it short and wide
- The area stays constant — this is the key constraint

---

## Technical Architecture

### Serverless P2P via WebRTC

The goal is **zero server infrastructure** for the core experience.

```
┌─────────┐     WebRTC DataChannel     ┌─────────┐
│ Peer A  │◄──────────────────────────►│ Peer B  │
│ (browser)│                            │ (browser)│
└────┬────┘                            └────┬────┘
     │          WebRTC DataChannel           │
     └──────────────────┬───────────────────┘
                        │
                   ┌────▼────┐
                   │ Peer C  │
                   │ (browser)│
                   └─────────┘
```

**Signaling**: WebRTC requires an initial signaling step to exchange connection offers. Options (in order of preference for "serverless"):

1. **Trystero** — library that uses BitTorrent trackers, IPFS, or Nostr relays as the signaling layer. No custom server needed.
2. **Manual exchange** — copy-paste connection strings (fallback, clunky but truly zero-infrastructure)
3. **PeerJS cloud** — free hosted signaling server (simple, but adds a dependency)

**Data exchanged**: Only small JSON messages (~100 bytes per update):
```json
{
  "peerId": "alice",
  "mu": 2.3,
  "sigma": 0.8,
  "revealed": false
}
```

### Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| **UI framework** | Vanilla JS + Canvas/SVG | Minimal deps, fast load, single HTML file possible |
| **P2P communication** | Trystero (WebRTC) | Serverless signaling via BitTorrent/Nostr/IPFS |
| **Math/rendering** | Canvas 2D API | Log-normal PDF rendering, blob interaction |
| **Bundling** | None initially (ES modules) | Keep it simple; add Vite if needed |

### Target: Single HTML File

The MVP should be deployable as a **single HTML file** — open it in a browser, share the session code, done. No build step, no server, no install.

---

## Scope

### MVP (v0.1)

- [ ] 2D canvas with log-normal blob interaction
- [ ] Drag to position estimate (μ) and certainty (σ)
- [ ] Fixed-area constraint with real-time blob reshaping
- [ ] P2P session creation and joining (via Trystero)
- [ ] Hidden estimates until facilitator reveal
- [ ] Overlay all team estimates after reveal
- [ ] Session naming (what are we estimating?)
- [ ] Works on desktop browsers (Chrome, Firefox, Edge, Safari)

### Post-MVP

- [ ] Composite "team distribution" overlay
- [ ] Statistics: mean, median, spread, agreement score
- [ ] Re-estimation rounds
- [ ] Export session results (JSON/CSV)
- [ ] Mobile-friendly touch interaction
- [ ] Named reference points on X-axis (e.g., "past stories" as calibration anchors)
- [ ] QR code for session joining
- [ ] Optional: map final consensus back to Fibonacci scale for Jira compatibility

### Non-Goals (for now)

- User accounts / authentication
- Server-side persistence
- Issue tracker integration
- Chat / video within the tool

---

## Open Questions

1. **X-axis scale**: Should it be purely abstract, or anchored to something (story points, hours, T-shirt sizes)? Keeping it abstract preserves the tool's philosophy but may confuse teams used to discrete scales.

2. **Facilitator role**: Is there a designated facilitator, or can anyone trigger reveal? P2P model makes "roles" harder — simplest is anyone can reveal.

3. **Blob interaction feel**: Should the blob follow the cursor exactly, or have physics-based inertia? Exact = precise, inertia = playful.

4. **Color-blind accessibility**: Overlaid blobs need more than just color differentiation — patterns, labels, or opacity variations.

5. **P2P mesh limits**: WebRTC full-mesh scales poorly past ~10-15 peers. Is this acceptable for typical scrum teams (5-9 people)?

6. **What happens after reveal?** Just visual inspection, or do we compute a "team estimate" (e.g., weighted median where certainty = weight)?

---

## Name Options

| Name | Pros | Cons |
|---|---|---|
| **Estimate** | Clear, verb-as-name | Generic, hard to search |
| **Blobpoker** | Memorable, describes the mechanic | Silly |
| **Contour** | Evokes the shape + topographic precision | Abstract |
| **Smear** | Describes the visual | Slightly negative connotation |
| **Haze** | Captures uncertainty | Negative connotation |
| **Foggy** | Uncertainty + approachable | Suggests imprecision |
