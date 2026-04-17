# Protocol — Estimate P2P Communication

This document describes the peer-to-peer communication protocol used by Estimate, including message types, transport layers, identity exchange, liveness detection, and consistency guarantees.

---

## Design Principles

1. **Redundancy over reliability** — Three independent transports run simultaneously. Any one can fail without breaking the session.
2. **Self-describing messages** — Every relay message carries the sender's identity in the envelope. You can never receive a message without knowing who sent it.
3. **Mic holder as authority** — The facilitator (🎤 holder) is the single source of truth for verdicts and reveal state, eliminating timing races across peers.
4. **Idempotent receivers** — All message handlers are idempotent. Receiving duplicates via multiple transports is harmless (last-write-wins for estimates, dedup for state-changing actions).
5. **Clone-and-reassign** — P2P callbacks run outside Svelte's reactive context, so Maps/Sets are replaced wholesale (`map = new Map(map).set(k, v)`) rather than mutated in-place.

---

## Transport Layers

### Channel 1: WebRTC via Nostr Signaling

- **Library**: Trystero (`@trystero-p2p/nostr`)
- **Signaling**: Public Nostr relays (`nos.lol`, `relay.primal.net`)
- **Data**: WebRTC DataChannel (peer-to-peer, no relay after connection)
- **Strengths**: True P2P, low latency once connected
- **Weaknesses**: Blocked by symmetric NATs and aggressive corporate firewalls

### Channel 2: WebRTC via MQTT Signaling

- **Library**: Trystero (`@trystero-p2p/mqtt`)
- **Signaling**: HiveMQ and other public MQTT brokers via WebSocket
- **Data**: WebRTC DataChannel (same as above, different signaling path)
- **Strengths**: Different signaling infra — if Nostr relays are blocked, MQTT often works
- **Weaknesses**: Same WebRTC limitations once signaling succeeds

### Channel 3: Nostr Relay (Direct Encrypted Pub/Sub)

- **Library**: `nostr-tools` (direct usage, no Trystero)
- **Transport**: WebSocket to Nostr relays — no WebRTC involved
- **Encryption**: AES-256-GCM, key derived via HKDF-SHA256 from the room code
- **Event kind**: 25078 (ephemeral — forwarded to subscribers, not stored)
- **Filtering**: Events tagged with `#r` = SHA-256 hash of room code (first 16 hex chars)
- **Strengths**: Works through any firewall that allows WebSocket (port 443). No STUN/TURN needed.
- **Weaknesses**: Higher latency (relay round-trip), rate-limited by relay policies

### Sending

All messages are broadcast on all connected transports simultaneously via `Promise.allSettled`. A failure on one transport doesn't block others.

```
sendEstimate({ mu, sigma })
  → WebRTC/Nostr DataChannel
  → WebRTC/MQTT DataChannel
  → Nostr relay (encrypted envelope)
```

### Receiving

Messages arrive from multiple transports. State-changing actions (reveal, backlog, topic, mic, conclusion) use a dedup filter: if the same JSON payload arrives within 200ms, duplicates are dropped. Estimates and names are idempotent (overwrite with latest value).

---

## Peer Discovery & Identity

### Join/Leave Lifecycle

```
Peer A joins room
  ├── Trystero/Nostr fires onPeerJoin('nostr', peerB)     → first strategy: NEW peer
  ├── Trystero/MQTT  fires onPeerJoin('mqtt', peerB)      → second strategy: dup (ignored)
  └── Nostr relay message from peerB arrives               → third strategy: dup (ignored)

Peer B leaves
  ├── Trystero/Nostr fires onPeerLeave('nostr', peerB)    → 1 strategy remaining
  ├── Trystero/MQTT  fires onPeerLeave('mqtt', peerB)     → 0 strategies remaining → LEAVE
  └── nostr-relay ref auto-cleared (stale after WebRTC drops)
```

A peer is "joined" when seen on **any** transport, "left" only when gone from **all** transports.

### Self-Describing Relay Envelope

Every Nostr relay message carries the sender's identity:

```json
{
  "action": "ping",
  "from": "TXiv30GISm9iIQXQaOWP",
  "data": { "ts": 1713365000000 },
  "name": "Alice",
  "isCreator": true
}
```

**Rationale**: Earlier versions sent identity only in dedicated `name` messages. This caused a race condition — relay pings could register a peer before their name arrived, creating ghost "Connecting…" entries that persisted for seconds. By embedding identity in every message, a peer is both discovered and identified atomically.

The `getIdentity` callback is a closure over `SessionState`, so the name and creator flag are always current (survives role changes mid-session).

### Name Exchange (WebRTC)

On WebRTC-discovered peers (Nostr/MQTT strategies), identity is exchanged via explicit `NameMessage`:

1. On `onPeerJoin`: send own name + current estimate + session state
2. Peer responds with their own `NameMessage`
3. `onName` handler registers the peer's identity and cancels ghost-cleanup timers

### Ghost Peer Cleanup

If a WebRTC-discovered peer never sends a name (broken connection, self-echo, stale signaling):

| Time | Action |
|---|---|
| 0s | Peer appears in `peerIds`, ghost timers start |
| 5s | **Nudge**: re-send own `NameMessage` to prompt a response |
| 10s | **Evict**: remove peer from `peerIds` silently |

Both timers are cancelled when `onName` fires or the peer leaves. The nudge handles cases where the initial name exchange was lost; the evict handles cases where the peer doesn't actually exist.

### Visual States

| Peer State | What Users See | Duration |
|---|---|---|
| Syncing (nameless) | Dimmed, italic "Connecting…" with ⏳ | 0–10s, then evicted |
| Connected | Normal name with ready dot | Persistent |
| Stale (no heartbeat) | ⚠ warning indicator | After 15s silence |
| Offline (creator only) | Strikethrough name, "offline" tag | When creator peer disconnects |

---

## Message Types

### Continuous Messages (High Frequency)

| Message | Payload | Trigger | Dedup |
|---|---|---|---|
| `EstimateMessage` | `{ mu, sigma }` | Pointer drag, peer join | No (idempotent overwrite) |
| `PingMessage` | `{ ts }` | 5s heartbeat (WebRTC), 15s (relay) | No |

### State-Changing Messages (Deduped)

| Message | Payload | Trigger | Authority |
|---|---|---|---|
| `RevealMessage` | `{ revealed, reEstimate?, estimates?, verdict? }` | Auto-reveal, force reveal, next ticket | 🎤 holder only |
| `BacklogMessage` | `{ tickets[], prepMode? }` | Import, mode switch | Creator only |
| `TopicMessage` | `{ topic, url?, ticketId? }` | Ticket selection, topic edit | Any (but typically 🎤 holder) |
| `MicMessage` | `{ holder }` | Mic handoff/reclaim | Creator or current holder |
| `LiveAdjustMessage` | `{ liveAdjust }` | 🔒/🔓 toggle | 🎤 holder only |
| `ConclusionMessage` | `{ mode, sigma, ts }` | Facilitator drags conclusion curve | 🎤 holder only |

### Identity Messages

| Message | Payload | Trigger | Notes |
|---|---|---|---|
| `NameMessage` | `{ name, isCreator? }` | Peer join, nudge, role change | Also embedded in relay envelope |
| `ReadyMessage` | `{ ready, abstained? }` | Ready click, abstain | Per-peer flag |
| `UnitMessage` | `{ unit }` | Peer join (creator sends) | Creator → peers |

---

## Consistency Model

### The Mic Holder Pattern

The facilitator (🎤 holder) is the single source of truth. This eliminates a class of distributed consistency bugs:

**Problem**: If each peer independently computes the combined verdict from their local `peerEstimateMap`, timing differences in message delivery can produce different verdicts on different clients.

**Solution**: Only the mic holder's client computes verdicts. The `RevealMessage` carries:
- `estimates[]` — authoritative snapshot of all estimates at reveal time
- `verdict` — the computed VerdictSnapshot (mu, sigma, median, p10, p90)

Receivers **replace** their local `peerEstimateMap` with the snapshot and use the provided verdict directly. No client ever computes a verdict locally.

### Reveal Lifecycle

```
All peers ready (mic holder's client detects):
  checkAutoReveal()
    └── buildRevealPayload(s)
          ├── Snapshot: self estimate + all peerEstimateMap entries (excluding abstained)
          ├── Compute: combineEstimates() → snapVerdict()
          ├── Store: s.authoritativeVerdict = verdict
          └── Send: RevealMessage { revealed: true, estimates, verdict }

Receivers (onReveal):
  ├── s.revealed = true
  ├── Replace peerEstimateMap wholesale from estimates[]
  └── Stash s.authoritativeVerdict = msg.verdict
```

### Advance Lifecycle (Next Ticket)

```
Mic holder clicks "Next":
  handleNext(s, deps)
    ├── buildRevealPayload(s, { revealed: false })  ← sets authoritativeVerdict
    ├── saveRoundToHistory(s)                        ← consumes + clears authoritativeVerdict
    ├── resetRound(s)
    └── Send: RevealMessage { revealed: false, verdict }

Receivers (onReveal, revealed: false):
  ├── Stash authoritativeVerdict from msg.verdict
  ├── saveRoundToHistory(s)                          ← consumes + clears authoritativeVerdict
  └── resetRound(s)
```

**Key invariant**: `buildRevealPayload` must always be called **before** `saveRoundToHistory`. The verdict is set on `s.authoritativeVerdict`, consumed by `saveRoundToHistory`, then cleared. `saveRoundToHistory` never computes a verdict locally — it returns early if `authoritativeVerdict` is null.

---

## Name Collision Resolution

Duplicate names create confusion in a P2P system where there's no central registry.

### Detection

`onName` compares incoming name (case-insensitive) with own `userName`.

### Resolution Rules

| Scenario | Winner | Loser Action |
|---|---|---|
| Creator vs non-creator | Creator stays | Non-creator bounced (prompted to rename) |
| Non-creator vs non-creator | Lower `selfId` (deterministic tiebreak) | Higher `selfId` bounced |
| Established peer (>10s) vs newcomer | Established peer | Newcomer bounced |

### Debounce

Resolution is delayed 3 seconds to avoid bouncing on ghost peers that appear and vanish quickly. The timer is cancelled if the conflicting peer leaves before it fires.

---

## Heartbeat & Liveness

| Transport | Interval | Stale After |
|---|---|---|
| WebRTC (all strategies) | 5s ping | 15s |
| Nostr relay | 15s ping | — (relay pings also carry identity) |

`touchPeer(s, peerId)` is called on every received message (not just pings), updating `peerLastSeen`. The stale threshold is displayed as a ⚠ indicator next to the peer's name.

---

## Encryption

### Room Key Derivation

```
Room code (e.g. "keteteri")
  → HKDF-SHA256(IKM = room code UTF-8, salt = "estimate-room-key", info = "")
  → AES-256-GCM key
```

### Relay Message Encryption

```
Plaintext: JSON.stringify({ action, from, data, name, isCreator })
  → AES-256-GCM(key = roomKey, iv = random 12 bytes)
  → Base64(iv + ciphertext + tag)
  → Published as Nostr event content
```

### Room Identifier (d-tag)

```
Room code → SHA-256 → first 16 hex characters → used as Nostr event d-tag and r-tag
```

This keeps room codes private — the d-tag is a one-way hash.

---

## Nostr Event Types

### Kind 25078 — Ephemeral Relay Messages

- **Purpose**: Real-time P2P communication fallback
- **Persistence**: Not stored (ephemeral — forwarded to active subscribers only)
- **Tag**: `#r` = room d-tag hash
- **Content**: AES-256-GCM encrypted envelope

### Kind 30078 — Room State (Replaceable)

- **Purpose**: Async state for late joiners (backlog, unit, topic, prep mode, creator name)
- **Persistence**: Stored, replaceable by same pubkey + d-tag
- **Tag**: `#d` = room d-tag hash
- **Content**: AES-256-GCM encrypted JSON

### Kind 30079 — Prep-Done Signals (Replaceable)

- **Purpose**: Signal that a participant has finished pre-estimating
- **Persistence**: Stored, per-user replaceable (d-tag includes pubkey prefix)
- **Tags**: `#d` = room hash + pubkey[0:8], `#t` = "prep-done", `#r` = room hash
- **Content**: AES-256-GCM encrypted JSON (`{ name, ticketCount, timestamp }`)

---

## Capacity

- **Max peers**: 15 (WebRTC full-mesh practical limit, enforced in `onPeerJoin`)
- **Overflow peers**: Silently ignored (not added to `peerIds`)
- **Room namespace**: 4-syllable codes (consonant+vowel × 4) = 31.6M possible rooms

---

## Failure Modes & Recovery

| Failure | Detection | Recovery |
|---|---|---|
| WebRTC blocked | No peer-to-peer connection | Nostr relay fallback (self-describing envelopes) |
| All Nostr relays down | Relay messages fail | WebRTC channels still work (MQTT signaling) |
| MQTT broker down | MQTT strategy fails to init | Nostr signaling + relay still work |
| Peer crashes | No heartbeat for 15s | Stale indicator shown; eventually leaves from all strategies |
| Ghost peer (signaling artifact) | Present in peerIds but never sends name | Nudged at 5s, evicted at 10s |
| Name collision | Two peers with same name | Debounced resolution (3s), deterministic tiebreak |
| Mic holder disconnects | `onPeerLeave` for mic holder peer | Mic freed, "mic drop" toast, anyone can grab |
| Creator disconnects | `creatorPeerId` goes null | Any peer can "Claim backlog ✎"; auto-yields when creator returns |

---

## Protocol Evolution Notes

### Why Self-Describing Envelopes? (v2)

The original protocol (v1) treated the relay channel as a dumb pipe — relay messages were identical to WebRTC messages. Pings were excluded from peer registration to avoid ghost "Connecting…" entries from stale relay pings.

This created a worse problem: relay-only peers (those behind firewalls where WebRTC fails completely) could ping for minutes without being discovered, because their pings were ignored. The fix was to make **every relay message carry the sender's identity**, so pings discover and identify peers atomically.

### Why No Auto-Reconnect? (v2)

The original protocol had auto-reconnect (tear down and rebuild P2P when all peers go stale for 30s). In practice, this was harmful:
- It created duplicate sessions and ghost peer entries
- The relay channel already provides continuous connectivity without WebRTC
- Reconnecting doesn't fix the underlying cause (firewall, NAT)
- The nameless-peer eviction protocol handles dead connections better than a full teardown

The "Reconnect" button was also removed from the UI. If the relay works, messages flow. If nothing works, reconnecting won't help either.
