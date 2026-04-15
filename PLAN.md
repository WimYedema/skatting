# Skatting — Plan: Async Prep, Security & UX Gaps

## Goal

Make async prep a reliable, first-class workflow — not an accident that works sometimes. This is a USP: the PO imports a backlog on Monday, shares a link, and the team preps independently over the week without anyone needing to be online simultaneously.

**Decision:** Use Nostr event persistence (Option A) for true async. Address security at the same time — persisting state on public relays requires encrypting content.

---

## Phase 1 — Fix What's Broken (bugs, no new features)

**Outcome:** The current async flow works reliably for people who've already synced once.

| # | Task | Why | Effort |
|---|---|---|---|
| 1.1 | **Persist backlog on receive** — add `saveBacklog()` in `onBacklog` for non-creators | Refresh loses received backlog | S |
| 1.2 | **Persist unit + prepMode on receive** — save to localStorage in `onUnit`/`onBacklog` callbacks | Non-creators lose unit after refresh | S |
| 1.3 | **Track `hasMoved`** — only save pre-estimate when the user actually dragged the blob | "Next" silently saves ghost estimates | S |
| 1.4 | **Verdict dedup by ticket ID** — use `ticketId` instead of `label` in `saveVerdict` | Tickets with same title overwrite each other | S |
| 1.5 | **Extract session state machine** — move App.svelte state logic into a testable `src/lib/session-controller.ts` | All state transitions live in an untestable Svelte component | M |
| 1.6 | **State machine tests** — test the extracted controller with simulated P2P callbacks | Core logic has zero test coverage | M |

Task 1.5/1.6 are the highest-value testing investment. The controller encapsulates:
- `handleNext()` — save estimate → save history → reset → advance (or show summary)
- `selectTicket()` — save current → restore saved → sync topic
- `handleJoin()` — load localStorage → create session → wire callbacks
- `onPeerJoin` / `onBacklog` / `onReveal` callback chains
- `prepMode` ↔ `meetingMode` transitions

Test sequences like: import CSV → prepMode; selectTicket without moving → no save; handleNext with hasMoved → estimate saved; "Start meeting" → sendBacklog called with prepMode:false; allReady → revealed; last ticket Next → showSummary.

---

## Phase 2 — True Async + Security (Nostr Events)

**Outcome:** A participant can join for the first time with the PO offline and still receive the full backlog. All persisted state is encrypted. Room codes are hard to guess.

This phase combines the async fix and security because they share the same infrastructure: Nostr event persistence needs a keypair, and that keypair + room code gives us the encryption key.

### 2.1 Room Code Entropy

**Current:** 3 consonant-vowel syllables → 15×5 = 75 per pair → 75³ ≈ 422K rooms. Brute-forceable in minutes.

**New:** 4 syllables → 75⁴ ≈ 31.6M rooms. Plus encryption means guessing the code only gets you encrypted blobs.

Implementation: change `generateRoomId()` loop from 3 to 4 iterations. Room codes go from 6 to 8 chars (e.g. `ba-ki-tu-me`). Still pronounceable, easy to share on a call.

**Effort:** S (one-line change + display formatting)

### 2.2 Session Keypair

Generate a Nostr keypair (secp256k1) per session at creation time. Store the private key in localStorage alongside the session.

- **Creator:** generates keypair on "+ New Session", stores in `SavedSession`
- **Joiner:** doesn't need the private key — they derive an encryption key from the room code (see 2.3)
- **Nostr events:** signed with the session keypair, so relays accept them as valid events

The public key becomes the session identity on Nostr. Replaceable events are keyed by `pubkey + kind + d-tag`, so each session gets its own event namespace.

**Effort:** S (nostr-tools `generateSecretKey()` + `getPublicKey()`)

### 2.3 Encrypted Event Content

All Nostr event content is encrypted with a symmetric key derived from the room code. Anyone with the room code can decrypt; relay operators and snoopers cannot read backlog content.

**Key derivation:**
```
room_key = HKDF-SHA256(
    ikm = room_code,         // "bakitume"
    salt = app_id,            // "estimate-p2p-tool"  
    info = "skatting-room-v1"
)
```

**Encryption:** AES-256-GCM (Web Crypto API — available in all browsers, no extra dependency).

**What's encrypted:**
- Room state event content (backlog, unit, prepMode, topic)
- Prep-done signal event content (peer name, ticket count)

**What's NOT encrypted:**
- Nostr event metadata (pubkey, kind, tags, timestamp) — relays need these for filtering
- The `d-tag` uses a hash of the room code, not the code itself: `d = SHA256(room_code).hex().slice(0, 16)`
- Real-time P2P messages via Trystero — these are already WebRTC (encrypted in transit via DTLS)

**Effort:** M (key derivation + encrypt/decrypt functions + integration)

### 2.4 State Publication (Creator Side)

New module: `src/lib/nostr-state.ts`

Functions:
- `publishRoomState(relayUrls, secretKey, roomKey, state)` — publish/update a kind-30078 (application-specific) replaceable event with encrypted room state
- `publishPrepDone(relayUrls, secretKey, roomKey, peerName, ticketCount)` — publish a regular event signalling prep completion

**When to publish:**
- CSV import → publish initial state
- Backlog reorder/remove → publish updated state
- Unit change → publish updated state
- prepMode toggle → publish updated state

Uses `nostr-tools` for event creation, signing, and relay communication. Publishes to the same Nostr relays already configured for Trystero (`nos.lol`, `relay.primal.net`).

**Effort:** M

### 2.5 State Query (Joiner Side)

On join, before `createSession()`:
1. Derive room key from room code via HKDF
2. Compute d-tag hash from room code
3. Connect to Nostr relays, send REQ filter: `{ kinds: [30078], "#d": [dTagHash] }`
4. If event found → decrypt content → load backlog, unit, prepMode
5. Also query prep-done events: `{ kinds: [1], "#d": [dTagHash], "#t": ["prep-done"] }`
6. Show which peers have signalled prep completion
7. Then proceed with `createSession()` for real-time P2P

This means the join flow becomes:
```
Enter room code
    → derive room key
    → query Nostr relays (1-2s)
    → load state if found
    → connect P2P (Trystero)
    → receive live updates from online peers
```

**Effort:** M

### 2.6 Prep-Done Signalling

Participants publish a Nostr event when they finish prepping:
- Kind: regular event (kind 1) with tags `["d", dTagHash], ["t", "prep-done"]`
- Content: encrypted JSON `{ name: "Alice", ticketCount: 12, timestamp: ... }`
- Creator queries these on load and when checking readiness

UI: PO sees a list of who's done (with ticket count) in the sidebar or header, even when those peers are offline.

**Effort:** S (reuses the Nostr plumbing from 2.4/2.5)

### Security Summary

| Threat | Mitigation |
|---|---|
| **Guessing room codes** | 4 syllables = 31.6M rooms; encrypted content means guessing gives you nothing readable |
| **Relay operators reading backlog** | AES-256-GCM encryption; room code is the shared secret |
| **Impersonation (fake estimates)** | Real-time P2P via WebRTC is already peer-authenticated by Trystero's peer ID. Nostr events are signed by session keypair — only the creator can publish state updates |
| **Replay attacks** | Nostr replaceable events naturally supersede older versions. `created_at` timestamps prevent stale state |
| **Brute-force relay queries** | d-tag is a SHA256 hash of room code — attacker must guess the code to know which events to look for |
| **Data at rest on relay** | Encrypted. Relays auto-expire old events (typically 30-90 days). Room state is ephemeral by nature. |

**Not addressed (acceptable for team tool):**
- No per-user authentication (anyone with room code can join — by design)
- No end-to-end encryption of real-time P2P messages (WebRTC DTLS provides transport encryption)
- No protection against a malicious participant who has the room code (they can estimate, force-reveal, etc.)

---

## Phase 3 — High-Value UX Gaps + Component Tests

**Outcome:** Address the top friction points from the UX review. Add component-level tests for UI interactions.

| # | Task | Why | Effort | Depends on |
|---|---|---|---|---|
| 3.1 | **Onboarding overlay** — brief "here's how the canvas works" on first use | Both roles confused on first load | S | — |
| 3.2 | **Abstain / skip** — participants can opt out of a ticket during meeting | Forced to estimate or block the team | M | — |
| 3.3 | **Skip prep option** — checkbox on import: "start in meeting mode" | Short backlogs don't need async prep | S | — |
| 3.4 | **Re-enter prep** — creator button to go back to prep mode | Premature "Start meeting" is irreversible | S | — |
| 3.5 | **Re-estimate round** — "Reset round" button to re-hide blobs | Can't redo after revealing a misunderstanding | M | — |
| 3.6 | **Component tests** — `@testing-library/svelte` tests for Svelte components | UI interactions untested | M | 1.5 |

Component tests (3.6) cover Svelte components in isolation with mocked P2P:
- **SessionLobby:** create/join/rejoin flows → verify correct `onJoin` callbacks
- **EstimationCanvas:** pointer events → verify `onEstimateChange` with correct mu/sigma
- **BacklogPanel:** import CSV, reorder, remove, progress indicators, disabled states
- **App (integration):** prep→meeting transition, ready/reveal button states, summary screen

Mock `createSession` to return fake senders. Simulate peers by calling callbacks (`onEstimate`, `onReveal`, etc.) directly. No network, no flakiness.

> Note: prep-done signalling (previously 3.2) moved to Phase 2.6 — it's a natural part of the Nostr integration.

---

## Phase 4 — Polish & Safety

| # | Task | Why | Effort |
|---|---|---|---|
| 4.1 | **Revisit verdict** — navigate back to completed tickets, overwrite cleanly | Old verdict lingers alongside new one | M |
| 4.2 | **Change unit** — creator can update unit mid-session + republish state | Locked at creation, requires new session | S |
| 4.3 | **Re-import safety** — warn before replacing backlog, offer merge | Re-import wipes team's prep work | M |
| 4.4 | **"Waiting for state" indicator** — spinner while querying Nostr relays on join | Brief delay before backlog appears | S |

---

## New Dependency

**`nostr-tools`** — the standard Nostr client library for JavaScript. Already used by Trystero internally (via `@trystero-p2p/nostr`), so it may already be in the dependency tree. If not, it's ~15KB gzipped and provides:
- `generateSecretKey()` / `getPublicKey()` — keypair generation
- `finalizeEvent()` — event creation + signing
- `Relay` / `SimplePool` — relay connection + subscription
- No native dependencies, works in browser

---

## Testing Strategy

Two layers, both deterministic and CI-friendly:

| Layer | Tool | What it covers | Flaky? |
|---|---|---|---|
| **State machine tests** (Phase 1.6) | Vitest | App state transitions, P2P callback logic, prep/meeting flow | No |
| **Component tests** (Phase 3.6) | Vitest + @testing-library/svelte | UI rendering, user interactions, button states | No |

E2E / multi-peer browser tests (Playwright) deferred — revisit once the state machine and component layers are solid.

**New dev dependency:** `@testing-library/svelte` (+ `@testing-library/jest-dom` for matchers).

---

## Sequencing

```
Phase 1 (bugs + state machine)   ████░░  ~2 days
Phase 2 (async + security)       ██████████░░  ~4 days
Phase 3 (UX gaps + component tests)  ████████░░  ~4 days — start after Phase 1
Phase 4 (polish)                 ████░░  ~2 days
```

Phase 1 first — bug fixes + extract state machine + write state tests. This is the foundation.
Phase 2 is the big investment — async + security together.
Phase 3 can start after Phase 1, in parallel with Phase 2. Component tests validate the UX gap implementations.
Phase 4 is discretionary.

---

## Blue Sky — Future Ideas

Things that would be cool but aren't on the roadmap yet. Captured here so we don't forget.

### VS Code Extension

Wrap the single-file HTML in a Webview panel (~50 lines of extension code). Gets Skatting into the VS Code Marketplace with zero separate codebase. Developers could estimate beside their code without opening a browser.

Higher-value integrations down the line:
- Command palette: "Skatting: Import backlog from CSV in workspace"
- Status bar: "3/5 prepped" indicator during async prep
- Notification: "PO started the meeting — join now"

### AI-Assisted Estimation (no API key required)

Three layers, from simple to ambitious:

**Heuristics + statistics (web + extension, zero dependencies)**
- Complexity flags — scan ticket description for risk words (API, migration, legacy) → "⚠️ mentions: database migration"
- Spread warning — after reveal, flag when P90/P10 ratio > 4× → "high disagreement — discuss"
- Bias tracking — "you consistently underestimate by 30% vs team median"
- Velocity patterns — "last 3 sprints averaged 34 points — you've estimated 52 so far"

**Similarity matching via browser-side embeddings (web + extension)**
- Run a small embedding model (~30MB, e.g. `all-MiniLM-L6-v2`) in-browser via Transformers.js / ONNX WASM
- Embed ticket titles/descriptions → compare against past estimated tickets
- Surface: "similar tickets were estimated at 5, 8, 5 points — median 5"
- Model downloads once, caches in browser. No server, no API key, fits the serverless architecture

**LLM via VS Code Copilot API (extension only, uses the user's existing Copilot subscription)**
- The `vscode.lm` Language Model API lets extensions call Copilot with no separate key
- Ticket decomposition: "this has 3 independent work streams — consider splitting"
- Estimate rationale: "key cost drivers: new API integration, data migration, UI changes"
- Discussion prompts after reveal: "the 3× spread might be because Alice considered the API dependency and Bob didn't"
- Smart summary: "sprint estimation complete — 42 points, 2 high-uncertainty items flagged"

The Copilot integration is the strongest argument for eventually building the VS Code extension — it transforms it from "same app in a panel" to "AI-assisted estimation integrated in your editor."

### E2E Testing (Playwright)

Multi-browser tests that exercise real P2P connections. Two browser contexts, one creator, one joiner, full journey through prep → meeting → reveal → export. Flaky by nature (depends on relays), so nightly-only, not gating CI. Revisit once Layer 1+2 testing is solid.

### 🌙 Moonshot: Probabilistic Sprint Forecasting

**The insight:** Skatting is the only estimation tool that captures uncertainty as a first-class dimension. Every blob is a log-normal distribution — not a point estimate. We have mu AND sigma for every ticket, for every team member. No one else has this data.

**The question stakeholders actually ask:** *"When will it be done?"*

Planning poker answers with a number. Skatting could answer with a **cone of probability.**

**How it works:**
1. After estimating a sprint backlog, run a Monte Carlo simulation — for each ticket, sample from its log-normal distribution (the math is already in `lognormal.ts`), sum across the backlog, repeat 10,000 times
2. Output: *"This sprint is 23 points at P50, but 38 points at P90"*
3. Overlay with historical velocity: *"You'll complete this backlog by Friday at 70% confidence, by next Wednesday at 95%"*
4. Visualize as a **burndown cone** — a widening/narrowing fan instead of a line. The cone narrows as tickets complete. At the start it's wide; by mid-sprint it converges on reality

**Why it's transformative:**
- **Nobody does this.** Jira, Linear, Shortcut all show burndown *lines*. Lines lie. A cone shows whether you're fine or doomed — before the sprint fails, not after
- **The certainty axis is the secret weapon.** High certainty tickets → narrow cone → predictable sprint. Five "gut feeling" tickets → wide cone → risky sprint. Risk becomes visible before the sprint starts
- **It compounds.** After a few sprints, calibration data accumulates. "Your team's P90 is actually P65 — you're systematically overconfident." The model self-corrects. Forecasts get genuinely accurate over time
- **It changes the conversation.** Instead of "can we fit 8 more points?" → "adding these 3 tickets moves your 90% confidence date from Friday to next Tuesday." Tradeoffs, not gut feelings

**Why Skatting is uniquely positioned:** Other tools would have to retrofit uncertainty. We already have it — every estimate is a distribution. The Monte Carlo math is trivial given `lognormal.ts`. The canvas visualization is our strength. Nostr persistence means calibration data survives across sprints.

**The vision:** *Skatting — the estimation tool that tells you when you'll be done, not just how big it is — with honest confidence intervals, not false precision.*

### 🌙 Moonshot: Value × Effort — Probabilistic Prioritisation

**The insight:** Skatting already captures effort with uncertainty. What if it also captured *value* with uncertainty? The ratio — value per point — becomes a *distribution*, not a number. You can compute the probability that ticket A delivers more bang-per-buck than ticket B.

That's way more honest than a WSJF number on a spreadsheet.

**The estimation mechanic stays the same:**

| | Effort | Value |
|---|---|---|
| Who knows? | Developers | PO / stakeholders |
| When? | Prep mode / meeting | PO preps value before the meeting |
| Interaction | Same blob, same canvas | Same X=magnitude, Y=certainty |

The PO estimates value using the same blob — same log-normal, same certainty axis. Just a different question: *"How valuable is this?"* instead of *"How much work?"*

**What falls out of value + effort:**

1. **Probabilistic priority ranking** — rank tickets by expected value-per-point with confidence intervals. Tickets whose value/effort distributions overlap → "these are genuinely interchangeable, stop arguing"

2. **Priority clouds, not dots** — plot each ticket as a probability cloud on a value (Y) vs effort (X) plane. Traditional matrices show dots in quadrants (quick wins / big bets / money pits). Skatting shows *clouds* — the shape reveals how sure the team is. A tight cloud in "quick win" = do it. A cloud sprawling across quadrants = investigate before committing.

3. **Sprint optimisation (ties into Monte Carlo)** — given a velocity budget, find the commitment that maximises expected value delivered: *"Swapping ticket D for ticket G improves expected value by 15% with the same effort budget."* A knapsack problem with uncertain weights and values — tractable via simulation.

4. **Cost of delay becomes visible** — if value is time-sensitive ("worth 100 now, 20 next sprint"), the priority cloud drifts downward over time. Urgency becomes a shape, not a label.

**What's needed:**
- A second estimation round per ticket (or mode toggle: "estimate effort" / "estimate value")
- One more (mu, sigma) pair per ticket per participant
- A combined view: scatter plot with probability clouds, ranked priority list, sprint optimiser

**Why this is unique:** WSJF exists. Value/effort matrices exist. But they all use point estimates that hide uncertainty. Nobody plots the *probability that ticket A beats ticket B* in value-per-point. Nobody shows you that two tickets are statistically indistinguishable so stop debating them.

**Combined vision with the forecasting moonshot:** The two moonshots are halves of the same picture — *probabilistic planning, not just estimation.* Effort distributions power the **burndown cone** (when will we be done?). Value distributions power the **priority cloud** (what should we do first?). Together: *"Here's the sprint that delivers the most value by Friday with 90% confidence."*
