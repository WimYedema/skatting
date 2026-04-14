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
