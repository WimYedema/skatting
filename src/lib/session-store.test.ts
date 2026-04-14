import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	deleteSession,
	getBacklog,
	getLastUserName,
	getPreEstimates,
	getSavedSessions,
	getVerdictHistory,
	type HistoryVerdict,
	type SavedSession,
	saveBacklog,
	savePreEstimate,
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
			roomId: 'room-1',
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

	it('replaces existing verdict with same label, unit, and roomId', () => {
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

	it('filters by roomId — sessions do not mix', () => {
		saveVerdict(makeVerdict({ label: 'A', roomId: 'room-1' }))
		saveVerdict(makeVerdict({ label: 'B', roomId: 'room-2' }))
		expect(getVerdictHistory(undefined, 'room-1')).toHaveLength(1)
		expect(getVerdictHistory(undefined, 'room-1')[0].label).toBe('A')
		expect(getVerdictHistory(undefined, 'room-2')).toHaveLength(1)
		expect(getVerdictHistory(undefined, 'room-2')[0].label).toBe('B')
	})

	it('filters by both unit and roomId', () => {
		saveVerdict(makeVerdict({ label: 'A', unit: 'points', roomId: 'room-1' }))
		saveVerdict(makeVerdict({ label: 'B', unit: 'days', roomId: 'room-1' }))
		saveVerdict(makeVerdict({ label: 'C', unit: 'points', roomId: 'room-2' }))
		expect(getVerdictHistory('points', 'room-1')).toHaveLength(1)
		expect(getVerdictHistory('points', 'room-1')[0].label).toBe('A')
	})

	it('keeps same label in different rooms separate', () => {
		saveVerdict(makeVerdict({ label: 'Task A', roomId: 'room-1' }))
		saveVerdict(makeVerdict({ label: 'Task A', roomId: 'room-2' }))
		expect(getVerdictHistory()).toHaveLength(2)
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

describe('pre-estimate persistence', () => {
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

	it('returns empty map when nothing saved', () => {
		expect(getPreEstimates('room-1').size).toBe(0)
	})

	it('saves and retrieves a pre-estimate', () => {
		savePreEstimate('room-1', 'T-1', 2.0, 0.5)
		const estimates = getPreEstimates('room-1')
		expect(estimates.size).toBe(1)
		expect(estimates.get('T-1')).toEqual({ mu: 2.0, sigma: 0.5 })
	})

	it('overwrites existing pre-estimate', () => {
		savePreEstimate('room-1', 'T-1', 2.0, 0.5)
		savePreEstimate('room-1', 'T-1', 3.0, 0.3)
		const estimates = getPreEstimates('room-1')
		expect(estimates.size).toBe(1)
		expect(estimates.get('T-1')).toEqual({ mu: 3.0, sigma: 0.3 })
	})

	it('keeps pre-estimates per room separate', () => {
		savePreEstimate('room-1', 'T-1', 2.0, 0.5)
		savePreEstimate('room-2', 'T-1', 4.0, 0.8)
		expect(getPreEstimates('room-1').get('T-1')?.mu).toBe(2.0)
		expect(getPreEstimates('room-2').get('T-1')?.mu).toBe(4.0)
	})

	it('stores multiple tickets per room', () => {
		savePreEstimate('room-1', 'T-1', 2.0, 0.5)
		savePreEstimate('room-1', 'T-2', 3.0, 0.6)
		expect(getPreEstimates('room-1').size).toBe(2)
	})

	it('handles corrupted localStorage gracefully', () => {
		store['estimate-pre-estimates'] = 'bad json{'
		expect(getPreEstimates('room-1').size).toBe(0)
	})

	it('filters out invalid entries', () => {
		store['estimate-pre-estimates'] = JSON.stringify({
			'room-1': { 'T-1': { mu: 2.0, sigma: 0.5 }, 'T-2': 'bad', 'T-3': null },
		})
		expect(getPreEstimates('room-1').size).toBe(1)
	})
})

describe('backlog persistence', () => {
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
		expect(getBacklog('room-1')).toEqual([])
	})

	it('saves and retrieves a backlog', () => {
		const tickets = [
			{ id: 'T-1', title: 'First task' },
			{ id: 'T-2', title: 'Second task', url: 'http://example.com' },
		]
		saveBacklog('room-1', tickets)
		const result = getBacklog('room-1')
		expect(result).toHaveLength(2)
		expect(result[0].id).toBe('T-1')
		expect(result[1].url).toBe('http://example.com')
	})

	it('keeps backlogs per room separate', () => {
		saveBacklog('room-1', [{ id: 'A', title: 'Task A' }])
		saveBacklog('room-2', [{ id: 'B', title: 'Task B' }])
		expect(getBacklog('room-1')[0].id).toBe('A')
		expect(getBacklog('room-2')[0].id).toBe('B')
	})

	it('overwrites existing backlog for same room', () => {
		saveBacklog('room-1', [{ id: 'A', title: 'Old' }])
		saveBacklog('room-1', [{ id: 'B', title: 'New' }])
		const result = getBacklog('room-1')
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('B')
	})

	it('handles corrupted localStorage gracefully', () => {
		store['estimate-backlogs'] = 'bad{'
		expect(getBacklog('room-1')).toEqual([])
	})

	it('filters out invalid entries', () => {
		store['estimate-backlogs'] = JSON.stringify({
			'room-1': [{ id: 'T-1', title: 'Valid' }, { bad: true }, null, 42],
		})
		const result = getBacklog('room-1')
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('T-1')
	})
})
