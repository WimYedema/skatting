# FMEA — Failure Mode and Effects Analysis

> Last updated: April 2026 · Covers triple-transport P2P, authoritative verdicts, Nostr relay fallback.

This document catalogues known failure modes, their effects, current mitigations, and risk priority numbers (RPN). It is intended to guide development priorities and inform operational decisions.

## Scoring

Each failure mode is rated on three axes (1–10 scale):

| Axis | 1 (best) | 10 (worst) |
|---|---|---|
| **Severity (S)** | Cosmetic / no impact | Session unusable / data loss |
| **Occurrence (O)** | Theoretically possible but never observed | Happens regularly in normal use |
| **Detection (D)** | Immediately obvious to user | Silent / impossible to detect |

**RPN** = S × O × D (range 1–1000). Higher = worse.

---

## 1. P2P Connectivity

| ID | Failure Mode | Effect | S | O | D | RPN | Current Mitigations |
|---|---|---|---|---|---|---|---|
| P-1 | All three transports fail simultaneously | Session completely unusable; no peer communication | 10 | 2 | 3 | 60 | Error message after 30s; health check every 8s |
| P-2 | WebRTC blocked by firewall/NAT | Peer listed but estimates don't sync via WebRTC | 7 | 5 | 6 | 210 | Nostr relay fallback (no WebRTC needed); triple-transport |
| P-3 | Nostr relay nodes offline/censored | Relay-only peers can't send or receive | 6 | 3 | 7 | 126 | 5 pinned relays; `Promise.any()` in publish; WebRTC fallback |
| P-4 | MQTT broker rate-limits or drops connection | Estimates lag or freeze on MQTT channel | 5 | 3 | 7 | 105 | `Promise.allSettled()`; relay + Nostr WebRTC still active |
| P-5 | Peer join/leave race across strategies | Same peer appears/disappears/reappears in list | 4 | 4 | 4 | 64 | `peerStrategies` map; join on first, leave on last strategy |
| P-6 | Heartbeat flood with many peers (>10) | Relay rate-limits; latency spikes | 5 | 3 | 7 | 105 | Relay heartbeat at 15s (slower than 5s WebRTC); no per-peer limiting |
| P-7 | Stale peer not visually indicated | User unsure which peers are actually connected | 3 | 5 | 8 | 120 | `peerLastSeen` tracked but no visual stale indicator in UI |

## 2. Cryptography & Security

| ID | Failure Mode | Effect | S | O | D | RPN | Current Mitigations |
|---|---|---|---|---|---|---|---|
| C-1 | AES-256-GCM decryption failure | Relay messages silently dropped | 3 | 2 | 8 | 48 | `.catch()` skips bad events; `isRelayEnvelope()` validation; WebRTC fallback |
| C-2 | Room code entropy too low (~26 bits) | Brute-force resistance reduced for relay eavesdropping | 5 | 2 | 10 | 100 | HKDF-SHA256 stretching; d-tag hides room code; attacker needs relay access |
| C-3 | Secret key stored in localStorage (creator) | XSS or device theft exposes room signing key | 6 | 2 | 10 | 120 | Key is per-session/ephemeral; creator-only; no cross-session reuse |
| C-4 | WebCrypto API unavailable (old browser) | Relay transport fails to initialize | 6 | 1 | 3 | 18 | `.catch()` on relay init; WebRTC fallback |
| C-5 | IV reuse in GCM | Encryption security completely broken | 10 | 1 | 10 | 100 | Fresh 12-byte IV via `crypto.getRandomValues()` per encrypt; probability negligible |
| C-6 | Nostr event signature forgery (key stolen) | Attacker impersonates peer | 7 | 1 | 8 | 56 | Keys ephemeral/per-session; rooms semi-private via d-tag |

## 3. State Consistency

| ID | Failure Mode | Effect | S | O | D | RPN | Current Mitigations |
|---|---|---|---|---|---|---|---|
| S-1 | Mic holder disconnects mid-reveal | Verdict authority becomes ambiguous; meeting flow breaks | 7 | 3 | 3 | 63 | Mic-drop toast; `claimMic()` available; verdict usually already computed |
| S-2 | Two peers both trigger auto-reveal (partition) | Divergent verdicts saved to history | 7 | 2 | 8 | 112 | Authoritative verdict from mic holder overwrites; `saveRoundToHistory` uses only `authoritativeVerdict` |
| S-3 | Estimate snapshot stale at reveal time | Late estimate excluded from combined verdict | 4 | 3 | 8 | 96 | Snapshot is authoritative and replayed to all peers; last-write-wins |
| S-4 | Abstain message lost; peer counted in verdict | Abstained peer's estimate included in combined result | 6 | 2 | 6 | 72 | `buildRevealPayload()` filters `abstainedPeers`; snapshot is authoritative |
| S-5 | Ready flags not cleared on re-estimate | Auto-reveal triggers prematurely | 5 | 2 | 5 | 50 | `onReveal(reEstimate=true)` clears ready state on peers |
| S-6 | LiveAdjust state diverges after message loss | Some peers can adjust post-reveal; others locked | 4 | 2 | 6 | 48 | `onPeerJoin` sends current liveAdjust flag; no mid-session recovery |
| S-7 | Estimate sent but not awaited before ready transition | Peers don't see creator's estimate before reveal | 5 | 2 | 8 | 80 | Estimate sent on drag (before transition); `Promise.allSettled` ensures execution |
| S-8 | Backlog merge silently drops pre-estimates | Pre-estimates from first import not visible after second import | 5 | 3 | 8 | 120 | `selectTicket()` queries localStorage as fallback; data exists but UI doesn't surface |
| S-9 | Auto-reveal fails when mic holder is offline | Meeting stalls; participants wait indefinitely | 6 | 2 | 7 | 84 | No explicit warning; `sendReveal` errors are silent |

## 4. Persistence & Storage

| ID | Failure Mode | Effect | S | O | D | RPN | Current Mitigations |
|---|---|---|---|---|---|---|---|
| D-1 | localStorage quota exceeded | Verdicts/backlog/pre-estimates silently not saved | 6 | 2 | 9 | 108 | `.catch()` on all writes; history capped at 50; no user notification |
| D-2 | Corrupted localStorage data | Affected room shows empty history/backlog | 3 | 2 | 4 | 24 | Try/catch + type validation; returns empty on parse error |
| D-3 | Private/incognito mode blocks localStorage | All persistence fails silently | 5 | 3 | 6 | 90 | All operations wrapped in try/catch; graceful in-memory fallback |
| D-4 | Verdict not saved before browser crash | Round lost from history | 6 | 1 | 9 | 54 | `addOrUpdateHistory()` writes immediately; no queue |
| D-5 | History filtered out by unit change | User sees empty history after switching points/days | 3 | 3 | 6 | 54 | Data persists; filter is display-only; switching back shows it |
| D-6 | Pre-estimates not restored on rejoin | User has to re-estimate tickets | 4 | 2 | 5 | 40 | `selectTicket()` checks `myEstimates` map then queries storage |

## 5. Canvas & UI

| ID | Failure Mode | Effect | S | O | D | RPN | Current Mitigations |
|---|---|---|---|---|---|---|---|
| U-1 | Canvas context lost (GPU crash / tab backgrounded) | Canvas goes blank; no recovery | 5 | 2 | 2 | 20 | No context loss detection or recovery handler |
| U-2 | Coordinate transform produces NaN/Infinity | Blob rendered at wrong position or missing | 4 | 1 | 4 | 16 | Bounds checking in canvas-coords; combineEstimates filters sigma ≤ 0 |
| U-3 | Text overflow on canvas (long ticket title) | Title cut off; user can't read | 2 | 4 | 2 | 16 | Truncation with "…" at ~60% canvas width |
| U-4 | ResizeObserver doesn't fire | Canvas stale after window resize | 4 | 1 | 4 | 16 | ResizeObserver on container div (per architecture guidelines) |
| U-5 | Frame rate drops with many peers (>10 blobs) | Sluggish canvas interaction | 4 | 2 | 2 | 16 | No culling; draws all blobs every frame |
| U-6 | No visual distinction between loading and disconnected | User can't tell if waiting for peers or if connection failed | 5 | 5 | 6 | 150 | Error message appears after 30s; no interim "connecting" state |

## 6. Browser Compatibility

| ID | Failure Mode | Effect | S | O | D | RPN | Current Mitigations |
|---|---|---|---|---|---|---|---|
| B-1 | WebRTC unsupported (IE, very old browsers) | App completely non-functional | 10 | 1 | 2 | 20 | Error message on startup; relay alone insufficient for full flow |
| B-2 | WebSocket unsupported (IE 9 and below) | No connectivity at all | 10 | 1 | 2 | 20 | Trystero fails on init; error surfaced |
| B-3 | TextEncoder/TextDecoder missing (old Safari) | Encryption fails; relay unavailable | 5 | 1 | 3 | 15 | No polyfill; WebRTC fallback |

## 7. Nostr Relay Infrastructure

| ID | Failure Mode | Effect | S | O | D | RPN | Current Mitigations |
|---|---|---|---|---|---|---|---|
| N-1 | Relay rate-limits high-volume rooms | Estimates stop syncing on relay channel | 5 | 3 | 7 | 105 | Multiple relays; `Promise.any()`; WebRTC carries most traffic |
| N-2 | Ephemeral events deleted before subscriber reads them | Late joiners miss recent relay messages | 4 | 3 | 8 | 96 | `since` set to 5s ago; WebRTC syncs full state on join |
| N-3 | Relay censors room (policy/DDoS mitigation) | Events silently dropped by that relay | 5 | 2 | 8 | 80 | 5 pinned relays; other relays + WebRTC still work |
| N-4 | Relay delivers events out of order | Last estimate may not be the latest one applied | 3 | 4 | 8 | 96 | Last-write-wins; authoritative verdict snapshot negates ordering issues |
| N-5 | Relay subscription filter mismatch (NIP-01 bug) | Relay events not received; no error | 5 | 1 | 9 | 45 | Standard NIP-01 filter; WebRTC fallback |
| N-6 | D-tag hash collision between rooms | Messages from different rooms leak (probability ~2⁻⁶⁴) | 10 | 1 | 10 | 100 | SHA-256 first 8 bytes; different room key won't decrypt anyway |

---

## Risk Matrix

```
         Occurrence →
         1    2    3    4    5
   S  ┌────┬────┬────┬────┬────┐
   e 9│    │    │    │    │    │
   v 8│    │    │    │    │    │
   e 7│C-6 │S-2 │S-1 │    │P-2 │
   r 6│C-3 │S-4 │S-9 │    │    │
   i  │D-4 │D-1 │    │    │    │
   t 5│C-5 │S-5 │D-3 │U-5 │U-6 │
   y  │    │S-6 │P-6 │    │P-7 │
     4│U-2 │D-6 │S-3 │N-4 │    │
     3│    │D-2 │D-5 │    │    │
     2│    │    │U-3 │    │    │
     1│    │    │    │    │    │
      └────┴────┴────┴────┴────┘
```

---

## Top 10 by RPN

| Rank | ID | Failure Mode | RPN |
|---|---|---|---|
| 1 | P-2 | WebRTC blocked by firewall/NAT | 210 |
| 2 | U-6 | No visual distinction between loading and disconnected | 150 |
| 3 | P-3 | Nostr relay nodes offline/censored | 126 |
| 4 | P-7 | Stale peer not visually indicated | 120 |
| 5 | C-3 | Secret key stored in localStorage | 120 |
| 6 | S-8 | Backlog merge silently drops pre-estimates | 120 |
| 7 | S-2 | Two peers both trigger auto-reveal (partition) | 112 |
| 8 | D-1 | localStorage quota exceeded | 108 |
| 9 | P-4 | MQTT broker rate-limits or drops connection | 105 |
| 10 | P-6 | Heartbeat flood with many peers | 105 |

---

## Recommended Actions (by priority)

### P0 — Address now

| ID | Action | Reduces |
|---|---|---|
| U-6 | Add explicit "connecting…" state distinct from "disconnected" | D: 6→2 |
| P-7 | Show stale/faded indicator for peers with no ping in 15s | D: 8→2 |
| S-9 | Warn when mic holder is stale and auto-reveal is pending | D: 7→3 |

### P1 — Next iteration

| ID | Action | Reduces |
|---|---|---|
| D-1 | Detect quota errors and show toast; offer to clear old rooms | D: 9→3 |
| S-8 | On merge import, explicitly load pre-estimates from storage into `myEstimates` map | O: 3→1 |
| P-6 | Aggregate pings: one relay broadcast per heartbeat interval, not per-peer | O: 3→1 |

### P2 — Medium-term

| ID | Action | Reduces |
|---|---|---|
| S-2 | Only the mic holder's `checkAutoReveal` sends reveal; peers suppress local auto-reveal | O: 2→1 |
| C-2 | Optionally allow longer room codes (custom input) for high-security sessions | S: 5→3 |
| U-1 | Add canvas context loss detection + auto-redraw on recovery | D: 2→1; S: 5→2 |

### P3 — Long-term

| ID | Action | Reduces |
|---|---|---|
| P-2 | Evaluate TURN relay integration for NAT traversal (requires server) | O: 5→2 |
| P-6 | Evaluate SFU (Selective Forwarding Unit) for >10-peer sessions | S: 5→2 |
| C-3 | Encrypt localStorage keys with a user-provided PIN or passkey | S: 6→3 |

---

## Assumptions

1. Target deployment is modern evergreen browsers (Chrome, Firefox, Safari, Edge). IE is out of scope.
2. Rooms have ≤15 simultaneous participants (WebRTC mesh limit).
3. Nostr relay infrastructure remains publicly accessible and free for ephemeral events.
4. Attackers cannot intercept the room code sharing channel (e.g., Slack DM, verbal).
5. Users are on the same session version (no backward compatibility required yet).
