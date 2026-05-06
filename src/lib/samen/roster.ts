/**
 * Samen roster CRUD — pure functions for team management.
 * No Nostr, no side effects. Operates on TeamSpace objects.
 */

import type { RoomRef, TeamMember, TeamSpace } from './types'

/** Create a new TeamSpace with the creator as owner. */
export function createTeamSpace(
	roomCode: string,
	teamName: string,
	ownerName: string,
	ownerPublicKey: string,
): TeamSpace {
	const now = Date.now()
	return {
		roomCode,
		name: teamName,
		members: [
			{
				id: crypto.randomUUID(),
				displayName: ownerName,
				publicKeys: [ownerPublicKey],
				role: 'owner',
				joinedAt: now,
				lastSeenAt: now,
			},
		],
		rooms: [],
		createdAt: now,
		updatedAt: now,
	}
}

/** Add a new member to the roster. Returns the updated TeamSpace. */
export function addMember(team: TeamSpace, displayName: string, publicKey: string): TeamSpace {
	const existing = findMemberByName(team, displayName)
	if (existing) {
		// Name match — add pubkey to existing member if not already present
		return addPublicKey(team, existing.id, publicKey)
	}
	const now = Date.now()
	const member: TeamMember = {
		id: crypto.randomUUID(),
		displayName,
		publicKeys: [publicKey],
		role: 'member',
		joinedAt: now,
		lastSeenAt: now,
	}
	return {
		...team,
		members: [...team.members, member],
		updatedAt: now,
	}
}

/** Remove a member by ID. Returns the updated TeamSpace. */
export function removeMember(team: TeamSpace, memberId: string): TeamSpace {
	return {
		...team,
		members: team.members.filter((m) => m.id !== memberId),
		updatedAt: Date.now(),
	}
}

/** Rename a member by ID. Returns the updated TeamSpace. */
export function renameMember(team: TeamSpace, memberId: string, newName: string): TeamSpace {
	return {
		...team,
		members: team.members.map((m) => (m.id === memberId ? { ...m, displayName: newName } : m)),
		updatedAt: Date.now(),
	}
}

/** Add a public key to an existing member (multi-device). Returns the updated TeamSpace. */
export function addPublicKey(team: TeamSpace, memberId: string, publicKey: string): TeamSpace {
	return {
		...team,
		members: team.members.map((m) =>
			m.id === memberId && !m.publicKeys.includes(publicKey)
				? { ...m, publicKeys: [...m.publicKeys, publicKey] }
				: m,
		),
		updatedAt: Date.now(),
	}
}

/** Update lastSeenAt for a member. Returns the updated TeamSpace. */
export function touchMember(team: TeamSpace, memberId: string): TeamSpace {
	const now = Date.now()
	return {
		...team,
		members: team.members.map((m) => (m.id === memberId ? { ...m, lastSeenAt: now } : m)),
		updatedAt: now,
	}
}

/** Find a member by their Nostr public key (any device). */
export function findMemberByPubkey(team: TeamSpace, publicKey: string): TeamMember | undefined {
	return team.members.find((m) => m.publicKeys.includes(publicKey))
}

/** Find a member by display name (case-insensitive). */
export function findMemberByName(team: TeamSpace, name: string): TeamMember | undefined {
	const lower = name.trim().toLowerCase()
	return team.members.find((m) => m.displayName.toLowerCase() === lower)
}

/** Get all display names from the roster, sorted alphabetically. */
export function rosterNames(team: TeamSpace): string[] {
	return team.members.map((m) => m.displayName).sort((a, b) => a.localeCompare(b))
}

// --- Room index ---

/** Register a tool-specific room in the team's room index. Returns the updated TeamSpace. */
export function addRoom(
	team: TeamSpace,
	roomCode: string,
	tool: string,
	label: string,
	createdBy: string,
): TeamSpace {
	const existing = team.rooms.find((r) => r.roomCode === roomCode)
	if (existing) return team
	const ref: RoomRef = {
		roomCode,
		tool,
		label,
		createdBy,
		createdAt: Date.now(),
		active: true,
	}
	return {
		...team,
		rooms: [...team.rooms, ref],
		updatedAt: Date.now(),
	}
}

/** Remove a room from the index by its room code. Returns the updated TeamSpace. */
export function removeRoom(team: TeamSpace, roomCode: string): TeamSpace {
	return {
		...team,
		rooms: team.rooms.filter((r) => r.roomCode !== roomCode),
		updatedAt: Date.now(),
	}
}

/** Archive a room (set active = false). Returns the updated TeamSpace. */
export function archiveRoom(team: TeamSpace, roomCode: string): TeamSpace {
	return {
		...team,
		rooms: team.rooms.map((r) => (r.roomCode === roomCode ? { ...r, active: false } : r)),
		updatedAt: Date.now(),
	}
}

/** Find rooms by tool name. */
export function findRoomsByTool(team: TeamSpace, tool: string): RoomRef[] {
	return team.rooms.filter((r) => r.tool === tool)
}

/** Find active rooms only. */
export function activeRooms(team: TeamSpace): RoomRef[] {
	return team.rooms.filter((r) => r.active)
}
