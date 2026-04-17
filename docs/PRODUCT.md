# Estimate — 2D Continuous Estimation Tool

## Vision

A real-time, peer-to-peer estimation tool for agile teams that replaces discrete card-based planning poker with a **two-dimensional continuous input**:

- **X-axis (Estimate):** Effort/size in configurable units (points or days) — left is small, right is large, with numeric tick marks
- **Y-axis (Certainty):** How confident the estimator is — 0% (uncertain) at bottom to 100% (certain) at top

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
| **Jira / issue tracker integration** | Phase 0: CSV/Excel import/export (any tracker); later: GitHub, Jira, Azure DevOps | Jira, Linear, GitHub, Azure DevOps | No | Jira (XML/CSV import) |
| **Async pre-estimation** | Yes — prepare estimates before the meeting | No | No | No |
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

#### Ticket Info on the Canvas (Sketchbook Notes)

When the current topic is a ticket (from CSV/Excel import or API), its metadata is drawn directly on the canvas like handwritten notes in a sketchbook:

- **Top-left corner**: ticket ID and title in Caveat font, slightly tilted (~1–2°), low opacity (~0.45) — feels like someone jotted it down before starting
- **Top-right corner**: labels (as small rounded tag shapes) and assignee name, if available
- Drawn as part of the canvas underlayer (after paper background, before axes) so blobs and annotations sit on top
- Uses the same sketchy style as history scribbles: seeded PRNG for deterministic slight jitter in position and rotation
- Text is truncated with "…" if it would overflow the available space (title max ~60% of canvas width)
- The ticket URL is **not** drawn on canvas (it's clickable in the header) — the canvas shows at-a-glance context only
- When no ticket is active (manual topic or no topic), this area is blank
- Synced via P2P: the `TopicMessage` already carries `ticketId` — the full ticket metadata comes from the `BacklogMessage` which all peers have received

This gives everyone immediate context about what they're estimating without leaving the canvas to read the ticket.

### Interaction Model

The user interacts by **dragging a single control point**:

- **Horizontal drag** → moves the estimate (μ)
- **Vertical drag** → adjusts certainty (σ inversely mapped)
- The blob morphs continuously: moving up makes it tall and narrow, moving down makes it short and wide
- The area stays constant — this is the key constraint

---

## Technical Architecture

### Serverless P2P via WebRTC + Nostr Relay

The goal is **zero server infrastructure** for the core experience.

```
┌─────────┐     WebRTC DataChannel     ┌─────────┐
│ Peer A  │◄──────────────────────────►│ Peer B  │
│ (browser)│    Nostr relay (encrypted) │ (browser)│
│         │◄──────────────────────────►│         │
└────┬────┘                            └────┬────┘
     │          WebRTC DataChannel           │
     │          Nostr relay (encrypted)      │
     └──────────────────┬───────────────────┘
                        │
                   ┌────▼────┐
                   │ Peer C  │
                   │ (browser)│
                   └─────────┘
```

**Signaling**: WebRTC requires an initial signaling step to exchange connection offers. The app uses a **triple-transport** approach for maximum reliability:

1. **Trystero via Nostr relays** — WebSocket connections to public Nostr relays (relay.damus.io, nos.lol, etc.) for WebRTC signaling
2. **Trystero via MQTT** — WebSocket connections to public MQTT brokers (HiveMQ) for WebRTC signaling
3. **Nostr relay (direct)** — Encrypted ephemeral events (kind 25078) published directly to Nostr relays as a **WebRTC-free fallback**

All three transports run simultaneously. Peers connect via whichever succeeds first. Messages are broadcast on all connected channels with deduplication. The Nostr relay fallback ensures the app works even when WebRTC peer connections are blocked by corporate firewalls or symmetric NATs.

**Encryption**: Relay messages are encrypted with AES-256-GCM using a key derived (HKDF-SHA256) from the room code. Only participants who know the room code can decrypt messages.

**Liveness**: WebRTC heartbeat at 5s intervals (15s stale threshold), relay heartbeat at 15s intervals. Ghost peers (discovered but never identified) are nudged at 5s and evicted at 10s. See [PROTOCOL.md](PROTOCOL.md) for the full protocol specification.

**Consistency**: The mic holder (facilitator) is the single source of truth for verdicts. On reveal, the mic holder snapshots all estimates and computes the authoritative verdict, broadcasting both to all peers. This eliminates timing races from different message arrival orders.

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
| **Language** | TypeScript (strict mode) | Catches shape-math bugs before runtime |
| **UI framework** | Svelte 5 (runes) | ~2 KB runtime, compiled reactivity, minimal boilerplate |
| **Canvas** | Canvas 2D API (native) | Full control over log-normal rendering and sketchy style |
| **P2P communication** | Trystero (Nostr + MQTT) | Dual-strategy serverless signaling for reliability |
| **Build** | Vite | Near-instant HMR, native TS/ESM support |
| **Lint + Format** | Biome | Single tool replaces ESLint + Prettier |
| **Unit tests** | Vitest | Vite-native, Jest-compatible API |
| **Single-file output** | vite-plugin-singlefile | Inlines all JS/CSS into one HTML file |

### Target: Single HTML File

The app is deployable as a **single HTML file** (~680 KB, ~215 KB gzipped) — open it in a browser, share the session code, done. Built with `vite-plugin-singlefile`.

---

## Scope

### MVP — Implemented ✅

- [x] 2D canvas with log-normal blob interaction
- [x] Drag to position estimate (μ) and certainty (σ)
- [x] Fixed-area constraint with real-time blob reshaping
- [x] P2P session creation and joining (via Trystero, dual Nostr + MQTT)
- [x] Hidden estimates until reveal (auto-reveal when all ready, or force reveal)
- [x] Overlay all team estimates after reveal
- [x] Session naming (inline editable topic)
- [x] Works on desktop browsers (Chrome, Firefox, Edge, Safari)
- [x] Composite "combined estimate" overlay (precision-weighted Bayesian)
- [x] Re-estimation rounds (Next → flow with history)
- [x] X-axis units (points or days, chosen at session creation)
- [x] Y-axis 0–100% certainty labels
- [x] Participant names and ready indicators
- [x] Sketchy hand-drawn visual theme (Caveat font, hatched fills, paper background)
- [x] History scribbles showing past combined estimates
- [x] Explicit "Done" button → auto-reveal → "Next" flow
- [x] Connection error detection and display
- [x] Session persistence (localStorage) with recent-room cards in lobby
- [x] Chart annotations: median label, P10–P90 range with elastic arrows and dashed range lines
- [x] CSV import — upload a backlog file, estimate tickets in sequence
- [x] CSV/Excel export — download results with median, P10–P90, unit columns
- [x] Ticket links — clickable link to original ticket in topic header
- [x] Ticket info drawn on canvas (ID, title, labels, assignee) in sketchbook style
- [x] Prep mode — go through backlog independently before meeting, toggle to meeting mode
- [x] Personal estimate persistence — saved/restored per ticket when switching
- [x] Persistent history scribbles — past session verdicts appear as faded pencil marks (toggleable)
- [x] Backlog panel — collapsible sidebar with ticket list, strikethrough for estimated items
- [x] P2P backlog sync — creator broadcasts backlog to joining peers

### Phase 2-5 — Implemented ✅

- [x] Nostr event persistence (kind 30078/30079) for offline-first join with AES-256-GCM encryption
- [x] 4-syllable room codes (31.6M namespace)
- [x] Onboarding overlay with spotlight tour (adaptive to prep/meeting mode)
- [x] Abstain ("No idea 🤷") and skip-peer for AFK participants
- [x] Lock blobs after reveal (anti-anchoring)
- [x] Ghost blob with "Drag me!" arrow for first-time users
- [x] Auto-abstain when user never drags
- [x] Post-reveal facilitation: convergence ring (green/amber/red), cluster lassos, pattern prompts
- [x] Deferred verdict — withheld until convergence or facilitator conclusion curve
- [x] Conclusion curve — facilitator drags combined curve to set verdict spatially
- [x] Live-adjust mode (🔒/🔓) — unlock everyone's blobs post-reveal
- [x] Per-person reveal skip (selective reveal for AFK participants)
- [x] Name picker on rejoin (Nostr state query, prep-done preview)
- [x] Late joiner catch-up banner
- [x] Paste-a-list import (plain text, one title per line)
- [x] Drag-and-drop CSV file import
- [x] Import menu ("Add tickets ▾") in header and backlog panel
- [x] Facilitator handoff ("The Mic 🎤") — hand off/reclaim navigation controls
- [x] Mic-drop on disconnect with grab/claim actions

### Post-MVP (Not Yet Implemented)

- [ ] Mobile-optimized touch interaction
- [ ] Named reference points on X-axis (calibration anchors)
- [ ] QR code for session joining
- [ ] Color-blind accessibility (patterns already used for fills, but needs testing)
- [ ] Issue tracker integration (GitHub, Jira) — see [Integration Plan](#integration-plan) below

### Non-Goals (for now)

- User accounts / authentication
- Server-side persistence
- Chat / video within the tool

---

## Resolved Design Decisions

1. **X-axis scale**: Configurable units — the session creator chooses "points" or "days" at creation time. This is synced to all peers and displayed on the axis. Range is 0–20.

2. **Facilitator role**: The session creator starts as facilitator — they control ticket navigation, can trigger re-estimates, toggle live-adjust mode, and drag the conclusion curve to set verdicts. The 🎤 (mic) can be handed off to any peer, transferring all navigation controls. If the mic holder disconnects, a "mic-drop" toast notifies the team and anyone can grab or reclaim the mic. Other participants estimate and discuss. **Backlog ownership** (✎) and **mic** (🎤) are independent artifacts: the backlog owner manages tickets and starts the meeting; the mic holder runs each round. If the original creator becomes unavailable, any peer can "Claim backlog ✎" — the claimed owner automatically yields when the original creator returns. Duplicate names are bounced: creator wins; between non-creators, a deterministic tiebreaker decides.

3. **Blob interaction feel**: The blob follows the cursor exactly (no inertia). Horizontal position controls mode (peak), vertical position controls sigma (certainty). The peak always tracks the cursor position precisely via `muFromMode`.

4. **Color-blind accessibility**: Blobs use diagonal hatch-fill patterns (not just color) to distinguish participants. Muted earthy tones used as colored-pencil palette.

5. **P2P mesh limits**: WebRTC full-mesh via Trystero. Practical limit ~10-15 peers — acceptable for typical scrum teams (5-9 people).

6. **After reveal**: A combined estimate is computed automatically using precision-weighted Bayesian combination (more certain estimates get more weight). The combined estimate is shown as a dashed outline. If the team converges (high pairwise overlap), a "call it N" verdict label appears automatically. If they diverge, the facilitator can drag the combined curve to create a **conclusion curve** — setting the verdict spatially. A ghost marker shows the original combined position. The facilitator can also toggle 🔒/🔓 to unlock everyone's blobs for live collaborative adjustment during discussion.

7. **History scribbles — current session vs. persistent**: The app already draws current-session history (past rounds in this session) as × marks with labels. This extends to **cross-session persistent history**: verdicts from previous sessions are stored in `localStorage` and drawn as even fainter pencil scribbles on the canvas, giving the paper a "used notebook" feel.

   **Design:**
   - When a round completes ("Next"), the combined estimate is persisted to `localStorage` alongside the session store, keyed by unit (points vs. days) — only same-unit history is shown
   - On canvas load, up to **~8–12** past verdicts are sampled from history and drawn as a faded underlayer beneath the current-session scribbles
   - **Spread, not clutter**: if history clusters in one area, the selection is thinned to maintain visual variety — pick entries that are spatially diverse across the X-axis
   - Visual style: same × mark + label as current-session history, but at **lower opacity** (~0.25 vs. 0.5) and slightly smaller font, so they read as old pencil marks that have been partially erased
   - Deterministic placement via seeded PRNG (seed from entry hash) — scribbles don't jump around on re-render
   - History entries store: `{ label, mu, sigma, unit, timestamp }` — timestamp enables "most recent N" or "last 30 days" filtering
   - A small toggle or settings option to hide persistent history for a clean canvas if preferred

## Open Questions

1. **Statistics panel**: Partially addressed — the canvas now shows inline annotations (median with "most likely" label, P10–P90 range with "80% falls here") that appear on the user's blob pre-reveal and on the combined blob post-reveal. A separate numerical panel may still be useful for export or detailed comparison.

2. **Touch optimization**: The current pointer-event model works on touch but hasn't been optimized for mobile screen sizes.

---

## Integration Plan

### Goal

Allow teams to pull issues from their tracker (GitHub, Jira) as estimation topics, and optionally write the verdict back. This must work within the serverless, client-side-only architecture.

### Supported Platforms

| Platform | API | Auth | CORS from browser |
|---|---|---|---|
| **GitHub** | REST v3 / GraphQL v4 | PAT (fine-grained) | ✅ api.github.com allows `*` origin |
| **Jira Cloud** | REST v3 | PAT or API token (email + token) | ❌ Blocked — requires Atlassian Connect app or CORS proxy |
| **Jira Server/DC** | REST v2 | PAT | ⚠️ Depends on admin CORS config |
| **Azure DevOps** | REST | PAT | ✅ dev.azure.com allows browser calls |
| **Linear** | GraphQL | API key | ✅ CORS allowed |

**Phase 0 (CSV/Excel — no API needed)**:  
- The PO / lead uploads a CSV or Excel (.xlsx) file containing tickets to estimate (columns: ID, Title, URL, optional labels/assignee)
- The app parses the file and presents tickets as an ordered backlog list
- The backlog is synced to all peers via P2P — team members see the same list without uploading anything
- Selecting a ticket sets it as the current estimation topic (with a clickable link to the original ticket)
- After estimation, verdicts are recorded alongside the tickets
- The PO / lead downloads results as CSV/Excel with estimate columns added (median, P10, P90, unit)
- Works with any tracker — export from Jira/GitHub/Azure DevOps/Linear/Trello, estimate, import back

**Phase 1**: GitHub only (CORS works natively, largest open-source user base).  
**Phase 2**: Jira Cloud + Server/DC (PAT support for both; Cloud requires solving CORS — see options below).  
**Phase 3**: Azure DevOps, Linear (both straightforward from browser).

### User Flow

```
1. PO / lead creates a session and clicks "Import backlog"
2. Phase 0: uploads a CSV/Excel file exported from their tracker
   — Later phases: prompted for platform + credentials (PAT / API token), selects repo/project
3. App parses the file → ordered ticket list appears in a backlog sidebar/panel
4. The backlog is synced to all peers via P2P (new BacklogMessage)
   — Team members see the same list without uploading anything
5. PO / lead selects the first ticket → it becomes the current estimation topic
   — Topic includes a clickable link to the original ticket URL
6. Team estimates as usual: drag blob → Done → reveal → discuss
7. After reveal: verdict recorded against the ticket in the backlog
   — Phase 0: saved locally, exported in final CSV/Excel download
   — Later phases: optional "Write back" → posts verdict via API
8. "Next issue" advances to the next unestimated ticket from the backlog
9. After all tickets: PO / lead clicks "Export results" → downloads CSV/Excel
```

### Ticket Links

When a topic is sourced from a ticket (CSV upload or API integration), the topic line in the session header becomes a **clickable link** to the original ticket URL. This allows team members to quickly open the ticket in their tracker for context.

- The `TopicMessage` P2P payload is extended to include an optional `url` field
- In the header, the topic is rendered as a link (`<a>`) when a URL is present, plain text otherwise
- Links open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`)
- When manually typing a topic, if the input starts with `http://` or `https://`, the app auto-detects it as a URL and makes it clickable

### Async Pre-Estimation (Prepare Before the Meeting)

The PO / lead prepares the backlog and shares it with the team ahead of time. Team members can then make their own estimates before the meeting so sessions go faster. The flow:

```
1. PO / lead creates a session, imports the backlog (CSV or API), and shares the session link
   → The backlog is persisted in localStorage so it survives page reloads
2. Team members join using the link at their own time
   → They receive the backlog via P2P (if the PO is online) or it's cached from a previous visit
3. Each member goes through the backlog solo, positioning their blob for each ticket
   → Estimates are saved locally per ticket (localStorage)
   → No "Done" / reveal is triggered — this is solo preparation mode
4. When the meeting starts, PO / lead opens the session and everyone joins
5. PO / lead selects the first ticket from the backlog
6. For each ticket, each participant's pre-made estimate is loaded automatically
   → The blob snaps to the position they chose during prep
7. Normal flow resumes: "Done" → reveal → discuss → adjust if needed → next
```

**Key design choices:**

- **Backlog owned by PO / lead** — only the session creator can import or reorder the backlog; it's synced read-only to other peers
- **Pre-estimates are local-only** — not sent over P2P until the meeting starts (prevents anchoring bias from seeing others' pre-estimates)
- **Pre-estimates are per-ticket, per-room** — stored in `localStorage` keyed by `roomId + ticketId`
- **Override allowed** — during the live meeting, users can adjust their pre-estimate before clicking "Done"
- **Visual indicator** — a small icon or badge shows which tickets already have a pre-estimate (✓ or filled dot)
- **No forced preparation** — if someone joins the meeting without pre-estimating, they start from the default blob position as usual
- **Solo mode detection** — if only one person is in the room (no peers connected), the UI hides "Done" / reveal and shows a "preparing" indicator instead

### Architecture

```
┌────────────────────────────────────────────────────┐
│                    Browser (Peer)                   │
│                                                     │
│  ┌─────────────┐    ┌──────────────┐               │
│  │ Estimation   │    │ Integration  │               │
│  │ Canvas/P2P   │◄──►│ Module       │               │
│  └─────────────┘    └──────┬───────┘               │
│                            │ HTTPS (fetch)          │
└────────────────────────────┼───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  GitHub/Jira API │
                    │  (external)      │
                    └─────────────────┘
```

- **No proxy server needed for GitHub** — direct `fetch()` to api.github.com with PAT in `Authorization` header
- Integration module is a pure TypeScript library (`src/lib/integrations/`)
- Only the PO / lead (session creator) imports the backlog — the ticket list is synced to peers via P2P `BacklogMessage`
- Write-back is optional and only performed by the user who has configured credentials

### Jira CORS Problem

Jira Cloud blocks browser-origin API calls. Options:

| Option | Pros | Cons |
|---|---|---|
| **Atlassian Forge app** | Official, marketplace-listed | Requires Atlassian account, review process, adds server dependency |
| **Lightweight CORS proxy** (e.g. Cloudflare Worker) | Simple, ~20 lines, free tier | Breaks "zero server" principle, proxy sees tokens in transit |
| **Browser extension** | No server, modifies CORS headers | Poor UX, per-browser install |
| **Copy-paste fallback** | Zero infrastructure | Manual, no write-back |

**Recommended**: Start with a **copy-paste fallback** (user pastes Jira issue key or URL, app displays it as topic). Add optional Cloudflare Worker proxy later for teams that want full integration. Document the trade-off clearly.

### Data Model

```typescript
/** CSV/Excel import row — minimal required columns */
interface ImportedTicket {
  id: string               // ticket ID (e.g. 'PROJ-123', '#42')
  title: string
  url?: string             // link to ticket in tracker (clickable in UI)
  labels?: string[]
  assignee?: string
  description?: string     // short description / summary (shown on canvas if present)
}

/** Extended topic message for P2P — includes optional URL */
type TopicMessage = {
  topic: string
  url?: string             // ticket URL, synced to all peers
  ticketId?: string        // ticket ID from backlog, for pre-estimate lookup
}

/** Backlog synced from PO/lead to all peers via P2P */
type BacklogMessage = {
  tickets: ImportedTicket[]
}

/** Ticket with estimation result, for export */
interface EstimatedTicket extends ImportedTicket {
  median?: number
  p10?: number
  p90?: number
  unit?: string            // 'points' or 'days'
}

/** Pre-estimation stored in localStorage */
interface PreEstimate {
  roomId: string
  ticketId: string
  mu: number
  sigma: number
  timestamp: number        // when the pre-estimate was made
}

interface TrackerConfig {
  platform: 'github' | 'jira' | 'azure-devops' | 'linear'
  baseUrl: string          // e.g. 'https://api.github.com' or Jira instance URL
  // credentials stored separately — see Confidentiality
}

interface TrackerIssue {
  id: string               // external ID (e.g. 'ORG/REPO#42', 'PROJ-123')
  title: string
  url: string              // link to open in tracker
  labels: string[]
  assignee?: string
  estimateField?: string   // existing estimate value if any
}

interface SessionIssue extends TrackerIssue {
  verdict?: string         // snapped verdict after reveal
  writtenBack: boolean     // whether verdict was posted to tracker
}
```

### Write-Back Strategy

| Platform | Write-back method | Field |
|---|---|---|
| **GitHub** | POST comment on issue | `"Estimate: 5 points (Fibonacci) — median 4.8, P10–P90: 2.1–9.3"` |
| **GitHub** | Add/update label | `estimate:5` |
| **Jira** | PUT story points field | `customfield_10016` (story points) or `customfield_10028` (story point estimate) |
| **Jira** | POST comment | Same format as GitHub |

Comments are preferred as the default — they're non-destructive, visible in history, and don't require knowing custom field IDs.

---

## Confidentiality & Security

### Threat Model

The app handles potentially sensitive data:
- **Issue titles and descriptions** — may contain proprietary feature names, customer names, internal project details
- **API credentials** (PATs, API tokens) — grant access to the user's repositories/projects
- **Estimation data** — who estimated what, team velocity patterns
- **Session metadata** — room IDs, participant names

### Current Security Properties

| Property | Status | Notes |
|---|---|---|
| **P2P data in transit** | ✅ Encrypted | WebRTC uses mandatory DTLS encryption — all DataChannel traffic is end-to-end encrypted between peers |
| **Signaling metadata** | ⚠️ Visible | Room IDs are broadcast on Nostr relays and MQTT brokers during signaling. An observer can see that *a room exists* but not the data exchanged after connection |
| **Local storage** | ⚠️ XSS-accessible | Session data in `localStorage` is readable by any script on the same origin |
| **No server-side data** | ✅ | No estimation data, credentials, or session content ever touches our infrastructure |
| **Static deployment** | ✅ | App is a single HTML file served from GitHub Pages — no server-side code that could be compromised |

### Credential Storage

API tokens (PATs) require careful handling since there's no server-side secure store:

| Option | Security | UX | Recommended |
|---|---|---|---|
| **Session-only (memory)** | ✅ Gone on tab close | ❌ Re-enter every session | For high-security teams |
| **`sessionStorage`** | ✅ Gone on tab close | ⚠️ Persists across refreshes in same tab | Default |
| **`localStorage`** | ⚠️ Persistent, XSS-accessible | ✅ Remember across sessions | Opt-in with warning |
| **`localStorage` + encryption** | ⚠️ Key must be somewhere | ✅ Adds a layer | Encrypt with user-provided passphrase |

**Recommended approach**:
1. Default to `sessionStorage` — tokens live only for the current browser tab
2. Offer "Remember token" checkbox that moves to `localStorage` with a clear warning: *"Your token will be stored in this browser. Anyone with access to this device can read it."*
3. Never send credentials over P2P — each peer authenticates independently with their own token
4. Never log or display full tokens in the UI — show only last 4 characters for identification

### P2P Confidentiality

- **Issue titles** are shared via P2P `TopicMessage` — all peers in the room see them. This is by design (the team is estimating together) but means:
  - Don't join untrusted rooms while connected to a tracker with sensitive issues
  - Room IDs should be shared only with team members (already the case — codes are short-lived and random)
- **Estimation values** (μ, σ) are shared with all peers — but only after the user clicks "Done" (pre-reveal) or on auto-reveal. Raw drag positions are never broadcast
- **Verdicts and write-back data** — only the user performing write-back sends data to the API; it doesn't flow through P2P

### Content Security Policy

The single-file deployment should declare a CSP that restricts:
- `script-src 'self'` — no inline scripts from third parties
- `connect-src` — whitelist only the APIs in use (api.github.com, Nostr relay URLs, MQTT broker URL)
- `frame-ancestors 'none'` — prevent embedding in iframes (clickjacking)

### Scope of Trust

| Actor | Trust level | What they see |
|---|---|---|
| **Peers in the room** | Trusted | Issue titles, all estimates after reveal, verdict |
| **Nostr/MQTT relays** | Untrusted | Room ID existence, encrypted WebRTC signaling offers (opaque) |
| **GitHub/Jira API** | Trusted by user | Issues, credentials, write-back content |
| **GitHub Pages CDN** | Trusted (serves app) | Static HTML only — no dynamic data |
| **Browser extensions** | Varies | Could read localStorage, intercept fetch — standard browser risk |

---

## Implementation Plan

The post-MVP features are organized into **sprints** (scrum-style). Each sprint delivers a shippable increment. Dependencies flow top-down — later sprints build on earlier ones.

### Sprint 1 — Backlog Foundation

> **Goal:** PO can upload a ticket list and drive the team through it in sequence.

| # | Task | Files | Description |
|---|---|---|---|
| 1.1 | **Extend `TopicMessage`** | `types.ts` | Add optional `url?: string` and `ticketId?: string` fields |
| 1.2 | **Add `BacklogMessage` type** | `types.ts` | New P2P message type: `{ tickets: ImportedTicket[] }` |
| 1.3 | **Add `ImportedTicket` interface** | `types.ts` | `{ id, title, url?, labels?, assignee?, description? }` |
| 1.4 | **Wire backlog P2P channel** | `peer.ts` | Add `sendBacklog` / `onBacklog` to `PeerSession` + `PeerCallbacks`; update `createSession` |
| 1.5 | **Wire extended topic** | `peer.ts` | Update `sendTopic` / `onTopic` to carry `url` and `ticketId` |
| 1.6 | **CSV parser** | `lib/csv.ts` (new) | Parse CSV text → `ImportedTicket[]`. Map column headers (ID, Title, URL, Labels, Assignee, Description). Pure function, unit-testable |
| 1.7 | **CSV parser tests** | `lib/csv.test.ts` (new) | Happy path, missing columns, extra columns, quoted fields, empty rows |
| 1.8 | **Excel parser** | `lib/csv.ts` | Add `.xlsx` parsing via [SheetJS](https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs) (ESM, ~90 KB). Same `ImportedTicket[]` output. Single-sheet, first row = headers |
| 1.9 | **Backlog state in App.svelte** | `App.svelte` | New state: `backlog: ImportedTicket[]`, `backlogIndex: number`, `topicUrl: string`. Wire `onBacklog` callback. PO advances with "Next issue" |
| 1.10 | **Backlog panel UI** | `components/BacklogPanel.svelte` (new) | Sidebar/collapsible list showing tickets. Current ticket highlighted. PO can click to select. Shows estimated ✓ vs. pending. Peers see read-only list |
| 1.11 | **File upload in lobby/session** | `App.svelte`, `BacklogPanel.svelte` | "Import backlog" button (creator only). `<input type="file" accept=".csv,.xlsx">`. Parse → set `backlog` state → sync via P2P |
| 1.12 | **Auto-advance on "Next"** | `App.svelte` | When backlog is loaded, "Next →" advances `backlogIndex`, sets topic/url from next ticket, syncs via `sendTopic` |

**Definition of Done:** PO uploads a CSV, team sees the ticket list, estimation flows ticket-by-ticket with topic auto-set.

---

### Sprint 2 — Ticket Context & Links

> **Goal:** Team has full ticket context without leaving the app.

| # | Task | Files | Description |
|---|---|---|---|
| 2.1 | **Clickable topic link** | `App.svelte` | Render topic as `<a href={topicUrl} target="_blank" rel="noopener noreferrer">` when URL is present. Falls back to plain text `<input>` when no URL |
| 2.2 | **Auto-detect URL in manual topic** | `App.svelte` | If user types a topic starting with `http://` or `https://`, parse it as a URL and make it clickable |
| 2.3 | **Ticket info on canvas** | `canvas.ts` | New `drawTicketInfo(ctx, width, height, ticket)` function. Top-left: ID + title (Caveat, ~0.45 alpha, slight tilt). Top-right: labels as tag shapes + assignee. Truncate with "…" |
| 2.4 | **Wire ticket info into drawScene** | `canvas.ts`, `EstimationCanvas.svelte` | Add optional `currentTicket?: ImportedTicket` param to `drawScene`. Pass from `EstimationCanvas` props. Draw after paper background, before axes |
| 2.5 | **Ticket info tests** | `canvas.test.ts` | Test `drawTicketInfo` — verify it calls ctx methods with expected positions, handles missing fields, truncates long titles |

**Definition of Done:** Ticket ID, title, labels, assignee visible on the canvas. Topic in header is a clickable link to the tracker.

---

### Sprint 3 — Export & Persistent History

> **Goal:** Results are downloadable and past estimates leave a trace.

| # | Task | Files | Description |
|---|---|---|---|
| 3.1 | **CSV export** | `lib/csv.ts` | `exportToCsv(tickets: EstimatedTicket[]): string` — generates CSV with columns: ID, Title, URL, Median, P10, P90, Unit |
| 3.2 | **Excel export** | `lib/csv.ts` | `exportToXlsx(tickets: EstimatedTicket[]): Blob` — generates `.xlsx` via SheetJS |
| 3.3 | **Record verdict per ticket** | `App.svelte` | On "Next", compute combined estimate, store `{ median, p10, p90, unit }` on the current `ImportedTicket` (extend to `EstimatedTicket`) |
| 3.4 | **Export button** | `App.svelte` | "Export results" button (creator only, visible when backlog has estimated tickets). Triggers download of CSV or Excel |
| 3.5 | **Export tests** | `lib/csv.test.ts` | Round-trip: import CSV → estimate → export CSV → verify columns match |
| 3.6 | **Persistent history store** | `lib/session-store.ts` | New `saveVerdict(entry: HistoryVerdict)` / `getVerdictHistory(unit): HistoryVerdict[]`. Stored in separate localStorage key `estimate-history`. Keeps last 50 entries. Schema: `{ label, mu, sigma, unit, timestamp }` |
| 3.7 | **Persistent history on canvas** | `canvas.ts` | Extend `drawHistoryScribbles` to accept a second array `persistentHistory`. Draw persistent entries at lower opacity (~0.25), smaller font. Sample up to 8–12 entries with spatial diversity (thin clusters on X-axis) |
| 3.8 | **Wire persistent history** | `App.svelte`, `EstimationCanvas.svelte` | Load persistent history on mount. Pass to `drawScene`. Save verdicts on "Next" |
| 3.9 | **History toggle** | `App.svelte` | Small toggle/checkbox in header: "Show past estimates". Default on. Hides persistent scribbles when off (current-session history always shown) |
| 3.10 | **Persistent history tests** | `session-store.test.ts`, `canvas.test.ts` | Store/retrieve verdicts, spatial thinning logic, opacity differentiation |

**Definition of Done:** PO can download results as CSV/Excel after a session. Past verdicts appear as faded pencil marks on the canvas.

---

### Sprint 4 — Async Pre-Estimation

> **Goal:** Team members can prepare estimates before the meeting.

| # | Task | Files | Description |
|---|---|---|---|
| 4.1 | **Pre-estimate store** | `lib/session-store.ts` | `savePreEstimate(roomId, ticketId, mu, sigma)` / `getPreEstimate(roomId, ticketId): {mu, sigma} \| null` / `getPreEstimates(roomId): Map<string, {mu, sigma}>`. Stored in `estimate-pre-estimates` localStorage key |
| 4.2 | **Solo prep mode detection** | `App.svelte` | New derived: `soloMode = $derived(peerIds.length === 0 && backlog.length > 0)`. When true: hide "Done" / "Reveal anyway", show "Save & Next" instead |
| 4.3 | **Save pre-estimate on advance** | `App.svelte` | In solo mode, "Save & Next" stores `{ roomId, ticketId, mu, sigma }` via `savePreEstimate()`, then advances to next ticket |
| 4.4 | **Load pre-estimate on ticket select** | `App.svelte` | When a ticket is selected (via backlog navigation or "Next"), check for a pre-estimate. If found, set `mu`/`sigma` to saved values |
| 4.5 | **Pre-estimate badge in backlog panel** | `BacklogPanel.svelte` | Show ✓ or filled dot next to tickets that have a pre-estimate. Show count: "5/12 prepared" |
| 4.6 | **Backlog persistence** | `lib/session-store.ts` | Persist backlog in localStorage keyed by `roomId`, so it survives page reloads even when the PO is offline. Load on session rejoin |
| 4.7 | **Pre-estimate tests** | `session-store.test.ts` | Store/retrieve/overwrite pre-estimates, solo mode behavior |

**Definition of Done:** Team members can join a session solo, go through the backlog, save pre-estimates. When the meeting starts, their blobs auto-load to prepared positions.

---

### Sprint 5 — Polish & Quality of Life

> **Goal:** Refinements that make the full flow smooth.

| # | Task | Files | Description |
|---|---|---|---|
| 5.1 | **Backlog reorder (PO only)** | `BacklogPanel.svelte` | Drag-to-reorder tickets. Reorder synced via `BacklogMessage` |
| 5.2 | **Skip / remove ticket** | `BacklogPanel.svelte`, `App.svelte` | PO can skip or remove a ticket from the backlog mid-session |
| 5.3 | **Backlog collapsed by default** | `BacklogPanel.svelte` | On small screens, backlog panel collapses to a minimal strip. Tap to expand |
| 5.5 | **End-of-session summary** | `App.svelte` | When all tickets estimated, show a summary view: table of tickets with verdicts, export button prominent |
| 5.6 | **Bundle size check** | Build config | Verify SheetJS impact on single-file output. Consider lazy-loading or CSV-only mode if too large |

**Definition of Done:** Full backlog-driven estimation flow works end-to-end with good UX.

---

### Dependency Graph

```
Sprint 1 (Backlog Foundation)
    │
    ├──► Sprint 2 (Ticket Context & Links)
    │
    ├──► Sprint 3 (Export & Persistent History)
    │        │
    │        └──► Sprint 4 (Async Pre-Estimation)
    │
    └──► Sprint 5 (Polish)  ← after Sprints 2–4
```

Sprints 2, 3, and 4 can overlap after Sprint 1 is done. Sprint 5 is a cleanup pass after the core features land.

### New Dependencies

| Package | Purpose | Size impact |
|---|---|---|
| [SheetJS (xlsx)](https://sheetjs.com/) | Parse/write `.xlsx` files | ~90 KB min (ESM). Loaded only when import/export triggered. CSV parsing needs no dependency |

No other new dependencies. CSV parsing is hand-rolled (~100 lines).

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
