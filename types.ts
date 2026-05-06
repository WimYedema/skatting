/**
 * Samen shared types — team roster, room index, and event bus data model.
 * Pure types, no runtime dependencies. Copied into every tool.
 */

/** A team workspace with its roster of members and known rooms. */
export interface TeamSpace {
	/** Team code — the shared anchor for all tools (HKDF seed) */
	roomCode: string
	/** Team display name, e.g. "Platform Squad" */
	name: string
	/** The roster */
	members: TeamMember[]
	/** Known tool-specific rooms (convenience index) */
	rooms: RoomRef[]
	/** Epoch ms — when the team was created */
	createdAt: number
	/** Epoch ms — bumped on any roster mutation */
	updatedAt: number
}

/** A member of a team. */
export interface TeamMember {
	/** Stable UUID — survives renames, device changes */
	id: string
	/** Canonical display name — the single source of truth */
	displayName: string
	/** Nostr signing pubkeys (one per device) */
	publicKeys: string[]
	/** Owner can manage the roster; member can self-register */
	role: 'owner' | 'member'
	/** Epoch ms */
	joinedAt: number
	/** Epoch ms — updated on activity in any tool */
	lastSeenAt: number
}

/** A reference to a tool-specific room belonging to this team. */
export interface RoomRef {
	/** Tool-specific room code */
	roomCode: string
	/** Which tool owns this room */
	tool: string
	/** Human-readable label, e.g. "Q3 Planning" */
	label: string
	/** TeamMember.id of the creator */
	createdBy: string
	/** Epoch ms */
	createdAt: number
	/** false = archived / completed */
	active: boolean
}

/** Cross-tool event envelope. Tools publish events they produce; other tools subscribe to types they understand. */
export interface SamenEvent {
	/** Namespaced event type: 'slim:estimation-request', 'skatting:verdicts', etc. */
	type: string
	/** Schema version — receivers ignore versions they don't understand */
	version: number
	/** Type-specific payload */
	payload: unknown
	/** TeamMember.id of the publisher (or 'anonymous' if no roster) */
	publishedBy: string
	/** Epoch ms */
	publishedAt: number
}

/** Cached local identity for cross-tool recognition. */
export interface SamenIdentity {
	/** The member's stable UUID from the roster */
	memberId: string
	/** Current display name */
	displayName: string
	/** This device's Nostr public key (hex) */
	publicKeyHex: string
}
