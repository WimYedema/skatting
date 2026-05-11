# Samen Protocol

**Samen** (Dutch: together) is the shared protocol layer for an ecosystem of loosely coupled agile tools. It provides team identity, cross-tool event routing, and data availability — capabilities that no individual tool should own.

This module is pure TypeScript with no UI framework dependency. It is embedded in every tool via [git subtree](../../docs/SAMEN.md#code-sharing-via-git-subtree).

## Quick start

```typescript
import { createTeamSpace, addMember, addRoom } from './roster'
import { publishRoster, queryRoster } from './roster-sync'
import { createEvent, publishEvent, queryEventByType } from './events'
import { loadCachedRoster, saveCachedRoster, loadIdentity } from './roster-store'
```

## Modules

| Module | Purpose |
|---|---|
| `types.ts` | `TeamSpace`, `TeamMember`, `RoomRef`, `SamenEvent`, `SamenIdentity` — pure types, no runtime |
| `roster.ts` | Roster CRUD + room index CRUD — pure functions on `TeamSpace` objects |
| `roster-sync.ts` | Publish/query roster via Nostr relays (kind 30078, AES-256-GCM) |
| `roster-store.ts` | localStorage caching for roster, room index, and cross-tool identity |
| `events.ts` | Event bus: create, publish, and query typed cross-tool events via Nostr |
| `crypto.ts` | HKDF-SHA256 key derivation + AES-256-GCM encrypt/decrypt for all channels |
| `nostr-config.ts` | Relay URLs, NIP-40 expiration defaults, `SyncKeys` interface |

## Data model

### TeamSpace

The root object. Stored encrypted on Nostr relays, cached in localStorage.

```typescript
interface TeamSpace {
  roomCode: string        // Team code — HKDF seed, the shared anchor
  name: string            // Display name, e.g. "Platform Squad"
  members: TeamMember[]   // The roster
  rooms: RoomRef[]        // Known tool-specific rooms (convenience index)
  createdAt: number       // Epoch ms
  updatedAt: number       // Epoch ms
}
```

### TeamMember

```typescript
interface TeamMember {
  id: string              // Stable UUID — survives renames, device changes
  displayName: string     // Canonical name — single source of truth
  publicKeys: string[]    // Nostr signing pubkeys (one per device)
  role: 'owner' | 'member'
  joinedAt: number
  lastSeenAt: number
}
```

### RoomRef

Tool-specific rooms belonging to this team. The room index is a convenience for discovery, not an authority — rooms work without being indexed.

```typescript
interface RoomRef {
  roomCode: string        // Tool-specific room code
  tool: string            // 'slim' | 'skatting' | 'bouwen' | etc.
  label: string           // Human-readable, e.g. "Q3 Planning"
  createdBy: string       // TeamMember.id
  createdAt: number
  active: boolean         // false = archived
}
```

### SamenEvent

Cross-tool event envelope. Tools publish events they produce; other tools subscribe to types they understand.

```typescript
interface SamenEvent {
  type: string            // Namespaced: 'slim:estimation-request', 'skatting:verdicts'
  version: number         // Schema version — receivers ignore unknown versions
  payload: unknown        // Type-specific
  publishedBy: string     // TeamMember.id (or 'anonymous')
  publishedAt: number     // Epoch ms
}
```

**Naming convention:** `<tool>:<noun>`. Unknown types are silently ignored.

## Encryption & Nostr layout

All data is encrypted with AES-256-GCM. Keys are derived from the team code via HKDF-SHA256 with channel-specific parameters:

| Channel | HKDF info | d-tag suffix |
|---|---|---|
| Roster | `samen-roster-v1` | `-roster` |
| Room index | `samen-rooms-v1` | `-rooms` |
| Event bus | `samen-events-v1` | `-events` |

All channels use HKDF salt `samen-team-tool`. The base d-tag is `SHA-256(teamCode)[0:16 hex]`.

Nostr event kind: **30078** (parameterized replaceable). Events carry NIP-40 expiration tags (default 30 days). Published to 2+ relays for redundancy.

## Roster API

```typescript
// Create
const team = createTeamSpace(roomCode, 'Squad Name', 'Alice', pubkeyHex)

// Members
team = addMember(team, 'Bob', bobPubkey)
team = removeMember(team, memberId)
team = renameMember(team, memberId, 'Robert')
team = addPublicKey(team, memberId, newDevicePubkey)  // multi-device
team = touchMember(team, memberId)                     // update lastSeenAt

// Query
const member = findMemberByPubkey(team, pubkey)
const member = findMemberByName(team, 'Alice')
const names  = rosterNames(team)  // sorted display names

// Room index
team = addRoom(team, roomCode, 'slim', 'Q3 Planning', memberId)
team = archiveRoom(team, roomCode)
team = removeRoom(team, roomCode)
const slimRooms = findRoomsByTool(team, 'slim')
const live      = activeRooms(team)

// Sync
await publishRoster(teamCode, syncKeys, team)
const team = await queryRoster(teamCode)

// Cache
saveCachedRoster(team)
const cached = loadCachedRoster(teamCode)
```

All roster/room functions are pure — they return a new `TeamSpace` object without mutating the input.

## Event bus API

```typescript
// Create and publish
const event = createEvent('slim:estimation-request', 1, payload, memberId)
await publishEvent(teamCode, syncKeys, event)

// Query
const latest = await queryEventByType(teamCode, 'skatting:verdicts')
const all    = await queryEvents(teamCode)  // newest-first
```

Each event type gets its own replaceable Nostr event (d-tag = `<base>-events-<type>`), so publishing a new `slim:estimation-request` replaces the previous one without affecting `skatting:verdicts`.

## Identity & caching

```typescript
// Identity persists across tools on the same origin
saveIdentity({ memberId, displayName, publicKeyHex })
const me = loadIdentity()

// Roster cache for offline / fast startup
saveCachedRoster(team)
const cached = loadCachedRoster(teamCode)  // backfills rooms:[] for old caches
```

localStorage keys (prefixed `samen-` to avoid collision with tool-specific keys):
- `samen-identity` — `SamenIdentity` (cross-tool, cross-session)
- `samen-roster-{hash}` — cached `TeamSpace`
- `samen-recent-teams` — `[{ teamCode, name, lastUsed }]`

## Dependencies

- `nostr-tools` — Nostr event creation, signing, relay pool
- Web Crypto API — HKDF, AES-256-GCM (built into all modern browsers)

## Tests

```sh
npx vitest run src/lib/samen/
```

## Full documentation

See [SAMEN.md](../../docs/SAMEN.md) for the complete protocol specification including architecture decisions, security model, user flows, and implementation plan.
