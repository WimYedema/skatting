import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	deleteSession,
	getLastUserName,
	getSavedSessions,
	getVerdictHistory,
	type HistoryVerdict,
	type SavedSession,
	saveSession,
	saveVerdict,
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

describe('verdict history', () => {
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

	function makeVerdict(overrides: Partial<HistoryVerdict> = {}): HistoryVerdict {
		return {
			label: 'Task A',
			mu: 2.0,
			sigma: 0.5,
			unit: 'points',
			timestamp: Date.now(),
			...overrides,
		}
	}

	it('returns empty array when nothing saved', () => {
		expect(getVerdictHistory()).toEqual([])
	})

	it('saves and retrieves a verdict', () => {
		saveVerdict(makeVerdict())
		const results = getVerdictHistory()
		expect(results).toHaveLength(1)
		expect(results[0].label).toBe('Task A')
	})

	it('replaces existing verdict with same label and unit', () => {
		saveVerdict(makeVerdict({ mu: 1.0 }))
		saveVerdict(makeVerdict({ mu: 3.0 }))
		const results = getVerdictHistory()
		expect(results).toHaveLength(1)
		expect(results[0].mu).toBe(3.0)
	})

	it('keeps verdicts with different labels separate', () => {
		saveVerdict(makeVerdict({ label: 'Task A' }))
		saveVerdict(makeVerdict({ label: 'Task B' }))
		expect(getVerdictHistory()).toHaveLength(2)
	})

	it('keeps verdicts with same label but different unit separate', () => {
		saveVerdict(makeVerdict({ label: 'Task A', unit: 'points' }))
		saveVerdict(makeVerdict({ label: 'Task A', unit: 'days' }))
		expect(getVerdictHistory()).toHaveLength(2)
	})

	it('filters by unit', () => {
		saveVerdict(makeVerdict({ label: 'A', unit: 'points' }))
		saveVerdict(makeVerdict({ label: 'B', unit: 'days' }))
		expect(getVerdictHistory('points')).toHaveLength(1)
		expect(getVerdictHistory('points')[0].label).toBe('A')
		expect(getVerdictHistory('days')).toHaveLength(1)
	})

	it('limits to 50 entries', () => {
		for (let i = 0; i < 60; i++) {
			saveVerdict(makeVerdict({ label: `Task ${i}`, timestamp: i }))
		}
		expect(getVerdictHistory()).toHaveLength(50)
		// Should keep most recent (last 50)
		expect(getVerdictHistory()[0].label).toBe('Task 10')
	})

	it('handles corrupted localStorage gracefully', () => {
		store['estimate-history'] = 'not json{'
		expect(getVerdictHistory()).toEqual([])
	})

	it('filters out invalid entries', () => {
		store['estimate-history'] = JSON.stringify([makeVerdict(), { bad: true }, null])
		expect(getVerdictHistory()).toHaveLength(1)
	})
})
