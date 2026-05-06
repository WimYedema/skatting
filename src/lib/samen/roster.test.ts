import { describe, expect, it } from 'vitest'
import {
	activeRooms,
	addMember,
	addPublicKey,
	addRoom,
	archiveRoom,
	createTeamSpace,
	findMemberByName,
	findMemberByPubkey,
	findRoomsByTool,
	removeMember,
	removeRoom,
	renameMember,
	rosterNames,
	touchMember,
} from './roster'
import { type TeamSpace, compoundRoomCode, parseRoomCode } from './types'

function makeTeam(): TeamSpace {
	return createTeamSpace('room-123', 'Test Squad', 'Alice', 'pubkey-alice')
}

describe('createTeamSpace', () => {
	it('creates a team with the owner as first member', () => {
		const team = makeTeam()
		expect(team.roomCode).toBe('room-123')
		expect(team.name).toBe('Test Squad')
		expect(team.members).toHaveLength(1)
		expect(team.members[0].displayName).toBe('Alice')
		expect(team.members[0].role).toBe('owner')
		expect(team.members[0].publicKeys).toEqual(['pubkey-alice'])
		expect(team.members[0].id).toBeTruthy()
		expect(team.rooms).toEqual([])
		expect(team.createdAt).toBeGreaterThan(0)
		expect(team.updatedAt).toBe(team.createdAt)
	})
})

describe('addMember', () => {
	it('adds a new member', () => {
		const team = addMember(makeTeam(), 'Bob', 'pubkey-bob')
		expect(team.members).toHaveLength(2)
		const bob = team.members[1]
		expect(bob.displayName).toBe('Bob')
		expect(bob.role).toBe('member')
		expect(bob.publicKeys).toEqual(['pubkey-bob'])
	})

	it('merges pubkey when name already exists (case-insensitive)', () => {
		const team = addMember(makeTeam(), 'alice', 'pubkey-alice-phone')
		expect(team.members).toHaveLength(1)
		expect(team.members[0].publicKeys).toEqual(['pubkey-alice', 'pubkey-alice-phone'])
	})

	it('does not duplicate pubkey on re-add', () => {
		const team = addMember(makeTeam(), 'Alice', 'pubkey-alice')
		expect(team.members).toHaveLength(1)
		expect(team.members[0].publicKeys).toEqual(['pubkey-alice'])
	})
})

describe('removeMember', () => {
	it('removes a member by ID', () => {
		let team = addMember(makeTeam(), 'Bob', 'pubkey-bob')
		const bobId = team.members[1].id
		team = removeMember(team, bobId)
		expect(team.members).toHaveLength(1)
		expect(team.members[0].displayName).toBe('Alice')
	})

	it('is a no-op for unknown ID', () => {
		const team = removeMember(makeTeam(), 'nonexistent')
		expect(team.members).toHaveLength(1)
	})
})

describe('renameMember', () => {
	it('renames a member', () => {
		const team = renameMember(makeTeam(), makeTeam().members[0].id, 'Alicia')
		// Need to use the same team instance
		const t = makeTeam()
		const renamed = renameMember(t, t.members[0].id, 'Alicia')
		expect(renamed.members[0].displayName).toBe('Alicia')
		expect(renamed.updatedAt).toBeGreaterThanOrEqual(t.createdAt)
	})
})

describe('addPublicKey', () => {
	it('adds a new pubkey to a member', () => {
		const team = makeTeam()
		const updated = addPublicKey(team, team.members[0].id, 'pubkey-alice-tablet')
		expect(updated.members[0].publicKeys).toEqual(['pubkey-alice', 'pubkey-alice-tablet'])
	})

	it('does not duplicate an existing pubkey', () => {
		const team = makeTeam()
		const updated = addPublicKey(team, team.members[0].id, 'pubkey-alice')
		expect(updated.members[0].publicKeys).toEqual(['pubkey-alice'])
	})
})

describe('touchMember', () => {
	it('updates lastSeenAt', () => {
		const team = makeTeam()
		const before = team.members[0].lastSeenAt
		const updated = touchMember(team, team.members[0].id)
		expect(updated.members[0].lastSeenAt).toBeGreaterThanOrEqual(before)
	})
})

describe('findMemberByPubkey', () => {
	it('finds a member by pubkey', () => {
		const team = addMember(makeTeam(), 'Bob', 'pubkey-bob')
		const found = findMemberByPubkey(team, 'pubkey-bob')
		expect(found?.displayName).toBe('Bob')
	})

	it('returns undefined for unknown pubkey', () => {
		expect(findMemberByPubkey(makeTeam(), 'unknown')).toBeUndefined()
	})
})

describe('findMemberByName', () => {
	it('finds by exact name', () => {
		expect(findMemberByName(makeTeam(), 'Alice')?.role).toBe('owner')
	})

	it('finds case-insensitively', () => {
		expect(findMemberByName(makeTeam(), 'alice')?.role).toBe('owner')
	})

	it('trims whitespace', () => {
		expect(findMemberByName(makeTeam(), '  Alice  ')?.role).toBe('owner')
	})

	it('returns undefined for unknown name', () => {
		expect(findMemberByName(makeTeam(), 'Charlie')).toBeUndefined()
	})
})

describe('rosterNames', () => {
	it('returns sorted display names', () => {
		let team = addMember(makeTeam(), 'Charlie', 'pk-c')
		team = addMember(team, 'Bob', 'pk-b')
		expect(rosterNames(team)).toEqual(['Alice', 'Bob', 'Charlie'])
	})
})

describe('addRoom', () => {
	it('adds a room to the index', () => {
		const team = makeTeam()
		const updated = addRoom(team, 'board-abc', 'slim', 'Q3 Planning', team.members[0].id)
		expect(updated.rooms).toHaveLength(1)
		expect(updated.rooms[0].roomCode).toBe('board-abc')
		expect(updated.rooms[0].tool).toBe('slim')
		expect(updated.rooms[0].label).toBe('Q3 Planning')
		expect(updated.rooms[0].active).toBe(true)
	})

	it('does not duplicate an existing room code', () => {
		const team = makeTeam()
		const first = addRoom(team, 'board-abc', 'slim', 'Q3 Planning', team.members[0].id)
		const second = addRoom(first, 'board-abc', 'slim', 'Different Label', team.members[0].id)
		expect(second.rooms).toHaveLength(1)
		expect(second.rooms[0].label).toBe('Q3 Planning')
	})
})

describe('removeRoom', () => {
	it('removes a room by room code', () => {
		const team = addRoom(makeTeam(), 'board-abc', 'slim', 'Q3', 'owner-id')
		const updated = removeRoom(team, 'board-abc')
		expect(updated.rooms).toHaveLength(0)
	})

	it('is a no-op for unknown room code', () => {
		const team = addRoom(makeTeam(), 'board-abc', 'slim', 'Q3', 'owner-id')
		const updated = removeRoom(team, 'nonexistent')
		expect(updated.rooms).toHaveLength(1)
	})
})

describe('archiveRoom', () => {
	it('sets active to false', () => {
		const team = addRoom(makeTeam(), 'board-abc', 'slim', 'Q3', 'owner-id')
		const updated = archiveRoom(team, 'board-abc')
		expect(updated.rooms[0].active).toBe(false)
	})
})

describe('findRoomsByTool', () => {
	it('filters rooms by tool', () => {
		let team = addRoom(makeTeam(), 'board-1', 'slim', 'Board 1', 'id')
		team = addRoom(team, 'session-1', 'skatting', 'Sprint 1', 'id')
		team = addRoom(team, 'board-2', 'slim', 'Board 2', 'id')
		expect(findRoomsByTool(team, 'slim')).toHaveLength(2)
		expect(findRoomsByTool(team, 'skatting')).toHaveLength(1)
		expect(findRoomsByTool(team, 'bouwen')).toHaveLength(0)
	})
})

describe('activeRooms', () => {
	it('excludes archived rooms', () => {
		let team = addRoom(makeTeam(), 'board-1', 'slim', 'Active', 'id')
		team = addRoom(team, 'board-2', 'slim', 'Will Archive', 'id')
		team = archiveRoom(team, 'board-2')
		expect(activeRooms(team)).toHaveLength(1)
		expect(activeRooms(team)[0].label).toBe('Active')
	})
})

// ── Compound room codes ──

describe('compoundRoomCode', () => {
	it('joins team code and session code with hyphen', () => {
		expect(compoundRoomCode('sunfish', 'bakuside')).toBe('sunfish-bakuside')
	})
})

describe('parseRoomCode', () => {
	it('parses compound code into team and session', () => {
		const parsed = parseRoomCode('sunfish-bakuside')
		expect(parsed.teamCode).toBe('sunfish')
		expect(parsed.sessionCode).toBe('bakuside')
	})

	it('returns null teamCode for standalone codes', () => {
		const parsed = parseRoomCode('bakuside')
		expect(parsed.teamCode).toBeNull()
		expect(parsed.sessionCode).toBe('bakuside')
	})

	it('treats leading hyphen as standalone', () => {
		const parsed = parseRoomCode('-bakuside')
		expect(parsed.teamCode).toBeNull()
		expect(parsed.sessionCode).toBe('-bakuside')
	})

	it('treats trailing hyphen as standalone', () => {
		const parsed = parseRoomCode('sunfish-')
		expect(parsed.teamCode).toBeNull()
		expect(parsed.sessionCode).toBe('sunfish-')
	})

	it('splits only on first hyphen', () => {
		const parsed = parseRoomCode('team-session-extra')
		expect(parsed.teamCode).toBe('team')
		expect(parsed.sessionCode).toBe('session-extra')
	})
})
