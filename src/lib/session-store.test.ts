import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	deleteSession,
	getLastUserName,
	getSavedSessions,
	type SavedSession,
	saveSession,
} from './session-store'

function makeSession(overrides: Partial<SavedSession> = {}): SavedSession {
	return {
		roomId: 'abc123',
		userName: 'Alice',
		topic: 'Sprint task',
		unit: 'points',
		isCreator: true,
		peerNames: ['Bob'],
		lastUsed: Date.now(),
		...overrides,
	}
}

describe('session-store', () => {
	let store: Record<string, string>

	beforeEach(() => {
		store = {}
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store[key] ?? null,
			setItem: (key: string, value: string) => {
				store[key] = value
			},
			removeItem: (key: string) => {
				delete store[key]
			},
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns empty array when nothing saved', () => {
		expect(getSavedSessions()).toEqual([])
	})

	it('saves and retrieves a session', () => {
		const session = makeSession()
		saveSession(session)
		const sessions = getSavedSessions()
		expect(sessions).toHaveLength(1)
		expect(sessions[0].roomId).toBe('abc123')
	})

	it('updates existing session by roomId', () => {
		saveSession(makeSession({ topic: 'Old topic' }))
		saveSession(makeSession({ topic: 'New topic' }))
		const sessions = getSavedSessions()
		expect(sessions).toHaveLength(1)
		expect(sessions[0].topic).toBe('New topic')
	})

	it('stores multiple sessions sorted by lastUsed descending', () => {
		saveSession(makeSession({ roomId: 'older', lastUsed: 1000 }))
		saveSession(makeSession({ roomId: 'newer', lastUsed: 2000 }))
		const sessions = getSavedSessions()
		expect(sessions[0].roomId).toBe('newer')
		expect(sessions[1].roomId).toBe('older')
	})

	it('limits to 10 sessions', () => {
		for (let i = 0; i < 15; i++) {
			saveSession(makeSession({ roomId: `room-${i}`, lastUsed: i }))
		}
		expect(getSavedSessions()).toHaveLength(10)
	})

	it('deleteSession removes by roomId', () => {
		saveSession(makeSession({ roomId: 'keep' }))
		saveSession(makeSession({ roomId: 'remove' }))
		deleteSession('remove')
		const sessions = getSavedSessions()
		expect(sessions).toHaveLength(1)
		expect(sessions[0].roomId).toBe('keep')
	})

	it('getLastUserName returns most recent session user', () => {
		saveSession(makeSession({ roomId: 'old', userName: 'Old', lastUsed: 1 }))
		saveSession(makeSession({ roomId: 'new', userName: 'New', lastUsed: 2 }))
		expect(getLastUserName()).toBe('New')
	})

	it('getLastUserName returns empty string when no sessions', () => {
		expect(getLastUserName()).toBe('')
	})

	it('handles corrupted localStorage gracefully', () => {
		store['estimate-sessions'] = 'not valid json{'
		expect(getSavedSessions()).toEqual([])
	})

	it('filters out invalid entries', () => {
		store['estimate-sessions'] = JSON.stringify([makeSession(), { bad: 'data' }, null, 42])
		const sessions = getSavedSessions()
		expect(sessions).toHaveLength(1)
		expect(sessions[0].roomId).toBe('abc123')
	})
})
