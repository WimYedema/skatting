# Skatting — Technical Review

Architectural review of USER-JOURNEYS.md against the actual implementation. Focus: does the async prep workflow actually work?

---

## Does Async Prep Work?

### The claim

The PO imports a CSV on Monday, shares the room code, and team members asynchronously prep over several days. Everyone joins at different times, works through tickets independently, and estimates are preserved until the meeting.

### The verdict: it works, but with hidden fragility

WebRTC (via Trystero) is synchronous by nature. Trystero uses public relays (Nostr WebSockets, MQTT broker) as signalling to establish peer-to-peer connections. There is **no message persistence** — if no peer is online to receive a broadcast, the message is lost.

After the first sync, localStorage carries the state. But getting that first sync requires the creator to be online.

| Scenario | Works? | Why |
|---|---|---|
| PO imports CSV, dev joins while PO is online | ✅ | `onPeerJoin` fires, state synced |
| Dev leaves, reopens hours later while PO is online | ✅ | localStorage + re-synced via P2P |
| Dev reopens hours later, PO is offline | ⚠️ | localStorage backlog, but unit/topic may be stale |
| Dev joins for first time, PO is offline | ❌ | No backlog, no unit — empty canvas |
| PO reorders backlog while dev is offline | ❌ | Dev keeps old order until next simultaneous online moment |

### The fundamental problem

For the "PO preps Monday, team preps Tuesday–Thursday" workflow:
- **The PO must be online when each team member first joins** (or have been online simultaneously at least once)
- After the first sync, it's fine — localStorage carries the state
- Backlog changes while the team is offline are invisible until the next co-online moment

---

## Bugs Found

### 1. `onBacklog` doesn't persist for non-creators (HIGH)

When a non-creator receives a backlog via P2P, the `onBacklog` callback updates in-memory state but never calls `saveBacklog()`. If the participant refreshes, they reload the stale localStorage version from their initial join.

### 2. Silent default estimates on "Next" (HIGH)

Clicking "Next issue →" without moving the blob saves the default position (mu=2.0, σ=0.6) as a real estimate. The user thinks they skipped the ticket; the app recorded a bogus estimate.

### 3. Verdict dedup uses label matching (LOW)

`saveVerdict()` deduplicates by `label + unit + roomId`. Two tickets with the same title would overwrite each other's verdicts.

---

## State Consistency Risks

### Backlog re-import wipes state

Re-importing a CSV replaces the entire in-memory backlog. The `myEstimates` map survives (keyed by ticket ID), so estimates for tickets whose IDs match are technically preserved. But:
- `backlogIndex` resets to -1
- Tickets with changed IDs are orphaned
- Non-creator's localStorage backlog is NOT updated (bug #1)

### Race condition on simultaneous `sendBacklog`

If the creator reorders while a new peer is joining, `onPeerJoin` sends the old order and the reorder handler sends the new order near-simultaneously. Last-write-wins via dual Nostr+MQTT — usually fine, theoretically non-deterministic.

### No message deduplication across strategies

Dual-strategy sends every message twice. Receivers are idempotent (same value overwritten), so it's harmless but wasteful.

---

## P2P Architecture Concerns

### No authentication

Room codes are 6 characters (~3,375 possible rooms). Anyone who guesses a code can join, receive the full backlog, send fake estimates, force-reveal, or claim to be the creator. Acceptable for internal team use; a concern for wider deployment.

### Relay dependency

The app depends on public Nostr relays (`nos.lol`, `relay.primal.net`) and a public MQTT broker — not under our control, subject to rate limiting or policy changes. The 8-second health check only detects total disconnection.

---

## Gap Feasibility Assessment

| Gap | Difficulty | Approach |
|---|---|---|
| **Onboarding** | Low | Overlay on first canvas render, `localStorage` flag |
| **Prep-done signalling** | Medium | New `PrepDoneMessage`, persist in localStorage, broadcast on connect |
| **Silent default estimates** | Low | Track `hasMoved` boolean, only save if moved |
| **Abstain / skip** | Medium | `abstain` field on `ReadyMessage`, exclude from combined estimate |
| **Re-estimate round** | Medium | "Reset round" button broadcasting `revealed: false` + clearing ready states |
| **Revisit verdict** | Medium–High | Navigate to completed tickets, overwrite verdict on re-estimate |
| **Skip prep** | Low | Checkbox on import or "Start meeting now" button |
| **Re-enter prep** | Low–Medium | Reverse `prepMode` toggle, broadcast via `sendBacklog` |
| **Change unit** | Low | Allow creator to change dropdown, broadcast `sendUnit`, warn about existing verdicts |

---

## Architectural Recommendations

### Fix `onBacklog` persistence (priority: HIGH)

Add `saveBacklog(session.roomId, tickets)` in the `onBacklog` callback for non-creators.

### Track `hasMoved` to prevent ghost estimates (priority: HIGH)

Add a `blobMoved` flag per ticket, set by `handleEstimateChange`, reset on ticket switch. Only persist if moved.

### Persist all non-creator state on receive (priority: MEDIUM)

Every `onBacklog`, `onUnit`, `onTopic` callback should persist to localStorage for non-creators.

### Address the "creator must be online" limitation (priority: HIGH for async USP)

Options from least to most ambitious:

1. **Honest warning** — show "Session creator isn't online — you'll receive the backlog when they return" after 5s with no peer response. Low effort, doesn't fix the problem.

2. **State-in-URL** — encode backlog hash or compressed state in the share link. Joiners get state from the URL itself, no P2P needed for initial sync. Medium effort, solves first-join, doesn't solve ongoing sync.

3. **Nostr event persistence** — publish backlog as a signed Nostr event (NIP-01). New joiners query relay history to get the latest state without needing the creator online. Higher effort, requires custom Nostr integration alongside Trystero, but unlocks true async.

4. **Lightweight relay/storage** — a small serverless function (Cloudflare Worker / Deno Deploy) that stores room state as a JSON blob keyed by room ID. Joiners fetch on connect. Breaks "fully serverless" claim but is operationally trivial.
