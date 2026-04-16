import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createScopedStorage,
	deleteSession,
	getLastUserName,
	getSavedSessions,
	type HistoryVerdict,
	type SavedSession,
	saveSession,
	setStorageQuotaHandler,
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

describe('scoped storage — verdict history', () => {
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
		const s = createScopedStorage('room-1', 'Alice')
		expect(s.getVerdictHistory()).toEqual([])
	})

	it('saves and retrieves a verdict', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict())
		const results = s.getVerdictHistory()
		expect(results).toHaveLength(1)
		expect(results[0].label).toBe('Task A')
	})

	it('replaces existing verdict with same label and unit', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict({ mu: 1.0 }))
		s.saveVerdict(makeVerdict({ mu: 3.0 }))
		const results = s.getVerdictHistory()
		expect(results).toHaveLength(1)
		expect(results[0].mu).toBe(3.0)
	})

	it('keeps verdicts with different labels separate', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict({ label: 'Task A' }))
		s.saveVerdict(makeVerdict({ label: 'Task B' }))
		expect(s.getVerdictHistory()).toHaveLength(2)
	})

	it('keeps verdicts with same label but different unit separate', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict({ label: 'Task A', unit: 'points' }))
		s.saveVerdict(makeVerdict({ label: 'Task A', unit: 'days' }))
		expect(s.getVerdictHistory()).toHaveLength(2)
	})

	it('filters by unit', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict({ label: 'A', unit: 'points' }))
		s.saveVerdict(makeVerdict({ label: 'B', unit: 'days' }))
		expect(s.getVerdictHistory('points')).toHaveLength(1)
		expect(s.getVerdictHistory('points')[0].label).toBe('A')
		expect(s.getVerdictHistory('days')).toHaveLength(1)
	})

	it('isolates verdicts by user', () => {
		const alice = createScopedStorage('room-1', 'Alice')
		const bob = createScopedStorage('room-1', 'Bob')
		alice.saveVerdict(makeVerdict({ label: 'A' }))
		bob.saveVerdict(makeVerdict({ label: 'B' }))
		expect(alice.getVerdictHistory()).toHaveLength(1)
		expect(alice.getVerdictHistory()[0].label).toBe('A')
		expect(bob.getVerdictHistory()).toHaveLength(1)
		expect(bob.getVerdictHistory()[0].label).toBe('B')
	})

	it('isolates verdicts by room', () => {
		const s1 = createScopedStorage('room-1', 'Alice')
		const s2 = createScopedStorage('room-2', 'Alice')
		s1.saveVerdict(makeVerdict({ label: 'A' }))
		s2.saveVerdict(makeVerdict({ label: 'B' }))
		expect(s1.getVerdictHistory()).toHaveLength(1)
		expect(s1.getVerdictHistory()[0].label).toBe('A')
	})

	it('deduplicates by ticketId when present, ignoring label', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict({ label: 'Old title', ticketId: 'PROJ-42', mu: 1.0 }))
		s.saveVerdict(makeVerdict({ label: 'Renamed title', ticketId: 'PROJ-42', mu: 3.0 }))
		const results = s.getVerdictHistory()
		expect(results).toHaveLength(1)
		expect(results[0].mu).toBe(3.0)
		expect(results[0].label).toBe('Renamed title')
	})

	it('keeps tickets with same label but different ticketIds separate', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict({ label: 'Setup', ticketId: 'PROJ-1' }))
		s.saveVerdict(makeVerdict({ label: 'Setup', ticketId: 'PROJ-2' }))
		expect(s.getVerdictHistory()).toHaveLength(2)
	})

	it('falls back to label dedup when ticketId is absent', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveVerdict(makeVerdict({ label: 'Ad-hoc topic', mu: 1.0 }))
		s.saveVerdict(makeVerdict({ label: 'Ad-hoc topic', mu: 2.0 }))
		expect(s.getVerdictHistory()).toHaveLength(1)
		expect(s.getVerdictHistory()[0].mu).toBe(2.0)
	})

	it('limits to 50 entries', () => {
		const s = createScopedStorage('room-1', 'Alice')
		for (let i = 0; i < 60; i++) {
			s.saveVerdict(makeVerdict({ label: `Task ${i}`, timestamp: i }))
		}
		expect(s.getVerdictHistory()).toHaveLength(50)
		expect(s.getVerdictHistory()[0].label).toBe('Task 10')
	})

	it('handles corrupted localStorage gracefully', () => {
		store['estimate-history:room-1:Alice'] = 'not json{'
		const s = createScopedStorage('room-1', 'Alice')
		expect(s.getVerdictHistory()).toEqual([])
	})

	it('filters out invalid entries', () => {
		const s = createScopedStorage('room-1', 'Alice')
		store['estimate-history:room-1:Alice'] = JSON.stringify([makeVerdict(), { bad: true }, null])
		expect(s.getVerdictHistory()).toHaveLength(1)
	})
})

describe('scoped storage — pre-estimates', () => {
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
		const s = createScopedStorage('room-1', 'Alice')
		expect(s.getPreEstimates().size).toBe(0)
	})

	it('saves and retrieves a pre-estimate', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.savePreEstimate('T-1', 2.0, 0.5)
		const estimates = s.getPreEstimates()
		expect(estimates.size).toBe(1)
		expect(estimates.get('T-1')).toEqual({ mu: 2.0, sigma: 0.5 })
	})

	it('overwrites existing pre-estimate', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.savePreEstimate('T-1', 2.0, 0.5)
		s.savePreEstimate('T-1', 3.0, 0.3)
		const estimates = s.getPreEstimates()
		expect(estimates.size).toBe(1)
		expect(estimates.get('T-1')).toEqual({ mu: 3.0, sigma: 0.3 })
	})

	it('isolates pre-estimates by user', () => {
		const alice = createScopedStorage('room-1', 'Alice')
		const bob = createScopedStorage('room-1', 'Bob')
		alice.savePreEstimate('T-1', 2.0, 0.5)
		bob.savePreEstimate('T-1', 4.0, 0.8)
		expect(alice.getPreEstimates().get('T-1')?.mu).toBe(2.0)
		expect(bob.getPreEstimates().get('T-1')?.mu).toBe(4.0)
	})

	it('isolates pre-estimates by room', () => {
		const s1 = createScopedStorage('room-1', 'Alice')
		const s2 = createScopedStorage('room-2', 'Alice')
		s1.savePreEstimate('T-1', 2.0, 0.5)
		s2.savePreEstimate('T-1', 4.0, 0.8)
		expect(s1.getPreEstimates().get('T-1')?.mu).toBe(2.0)
		expect(s2.getPreEstimates().get('T-1')?.mu).toBe(4.0)
	})

	it('stores multiple tickets', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.savePreEstimate('T-1', 2.0, 0.5)
		s.savePreEstimate('T-2', 3.0, 0.6)
		expect(s.getPreEstimates().size).toBe(2)
	})

	it('handles corrupted localStorage gracefully', () => {
		store['estimate-pre:room-1:Alice'] = 'bad json{'
		const s = createScopedStorage('room-1', 'Alice')
		expect(s.getPreEstimates().size).toBe(0)
	})

	it('filters out invalid entries', () => {
		store['estimate-pre:room-1:Alice'] = JSON.stringify({
			'T-1': { mu: 2.0, sigma: 0.5 },
			'T-2': 'bad',
			'T-3': null,
		})
		const s = createScopedStorage('room-1', 'Alice')
		expect(s.getPreEstimates().size).toBe(1)
	})
})

describe('scoped storage — backlog', () => {
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
		const s = createScopedStorage('room-1', 'Alice')
		expect(s.getBacklog()).toEqual([])
	})

	it('saves and retrieves a backlog', () => {
		const tickets = [
			{ id: 'T-1', title: 'First task' },
			{ id: 'T-2', title: 'Second task', url: 'http://example.com' },
		]
		const s = createScopedStorage('room-1', 'Alice')
		s.saveBacklog(tickets)
		const result = s.getBacklog()
		expect(result).toHaveLength(2)
		expect(result[0].id).toBe('T-1')
		expect(result[1].url).toBe('http://example.com')
	})

	it('isolates backlogs by user', () => {
		const alice = createScopedStorage('room-1', 'Alice')
		const bob = createScopedStorage('room-1', 'Bob')
		alice.saveBacklog([{ id: 'A', title: 'Task A' }])
		bob.saveBacklog([{ id: 'B', title: 'Task B' }])
		expect(alice.getBacklog()[0].id).toBe('A')
		expect(bob.getBacklog()[0].id).toBe('B')
	})

	it('isolates backlogs by room', () => {
		const s1 = createScopedStorage('room-1', 'Alice')
		const s2 = createScopedStorage('room-2', 'Alice')
		s1.saveBacklog([{ id: 'A', title: 'Task A' }])
		s2.saveBacklog([{ id: 'B', title: 'Task B' }])
		expect(s1.getBacklog()[0].id).toBe('A')
		expect(s2.getBacklog()[0].id).toBe('B')
	})

	it('overwrites existing backlog', () => {
		const s = createScopedStorage('room-1', 'Alice')
		s.saveBacklog([{ id: 'A', title: 'Old' }])
		s.saveBacklog([{ id: 'B', title: 'New' }])
		const result = s.getBacklog()
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('B')
	})

	it('strips runtime-only fields (median, p10, p90)', () => {
		const s = createScopedStorage('room-1', 'Alice')
		// Simulate saving an EstimatedTicket with verdict fields
		const ticketsWithMedian = [
			{ id: 'A', title: 'Task A', median: 5.0, p10: 2.0, p90: 12.0, estimateUnit: 'points' },
		]
		s.saveBacklog(ticketsWithMedian as never)
		const result = s.getBacklog()
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({ id: 'A', title: 'Task A' })
		expect('median' in result[0]).toBe(false)
	})

	it('handles corrupted localStorage gracefully', () => {
		store['estimate-backlog:room-1:Alice'] = 'bad{'
		const s = createScopedStorage('room-1', 'Alice')
		expect(s.getBacklog()).toEqual([])
	})

	it('filters out invalid entries', () => {
		store['estimate-backlog:room-1:Alice'] = JSON.stringify([
			{ id: 'T-1', title: 'Valid' },
			{ bad: true },
			null,
			42,
		])
		const s = createScopedStorage('room-1', 'Alice')
		const result = s.getBacklog()
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('T-1')
	})
})

// ---------------------------------------------------------------------------
// Storage quota error detection
// ---------------------------------------------------------------------------

describe('storage quota error detection', () => {
	let store: Record<string, string>
	let quotaCb: ReturnType<typeof vi.fn>

	beforeEach(() => {
		store = {}
		quotaCb = vi.fn()
		setStorageQuotaHandler(quotaCb)
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store[key] ?? null,
			setItem: (_key: string, _value: string) => {
				const err = new DOMException('quota exceeded', 'QuotaExceededError')
				throw err
			},
			removeItem: (key: string) => { delete store[key] },
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('fires callback on savePreEstimate quota error', () => {
		const s = createScopedStorage('room', 'Alice')
		s.savePreEstimate('T-1', 2.0, 0.5)
		expect(quotaCb).toHaveBeenCalledOnce()
	})

	it('fires callback on saveVerdict quota error', () => {
		const s = createScopedStorage('room', 'Alice')
		s.saveVerdict({ label: 'T', mu: 2, sigma: 0.5, unit: 'points', timestamp: 1 })
		expect(quotaCb).toHaveBeenCalledOnce()
	})

	it('fires callback on saveBacklog quota error', () => {
		const s = createScopedStorage('room', 'Alice')
		s.saveBacklog([{ id: 'T1', title: 'Test' }])
		expect(quotaCb).toHaveBeenCalledOnce()
	})
})
