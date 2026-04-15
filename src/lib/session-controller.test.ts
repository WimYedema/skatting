import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PeerCallbacks, PeerSession } from './peer'
import type { SessionDeps, SessionState } from './session-controller'
import {
	applyNostrState,
	checkAutoReveal,
	connectSession,
	createInitialState,
	createPeerCallbacks,
	getAllParticipants,
	getAllReady,
	getCurrentTicket,
	getEstimatedCount,
	getReadyCount,
	handleDone,
	handleEstimateChange,
	handleForceReveal,
	handleNext,
	handleRemove,
	handleReorder,
	handleTopicChange,
	joinSession,
	leaveSession,
	persistSession,
	prepareJoin,
	processBacklogImport,
	resetRound,
	saveRoundToHistory,
	selectTicket,
	startMeeting,
} from './session-controller'
import type { ScopedStorage } from './session-store'
import type { EstimatedTicket, ImportedTicket } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSession(): PeerSession {
	return {
		roomId: 'te-st-ro',
		selfId: 'self-id',
		sendEstimate: vi.fn().mockResolvedValue(undefined),
		sendReveal: vi.fn().mockResolvedValue(undefined),
		sendName: vi.fn().mockResolvedValue(undefined),
		sendTopic: vi.fn().mockResolvedValue(undefined),
		sendReady: vi.fn().mockResolvedValue(undefined),
		sendUnit: vi.fn().mockResolvedValue(undefined),
		sendBacklog: vi.fn().mockResolvedValue(undefined),
		leave: vi.fn(),
	}
}

function mockScopedStorage(overrides?: Partial<ScopedStorage>): ScopedStorage {
	return {
		savePreEstimate: vi.fn(),
		getPreEstimates: vi.fn().mockReturnValue(new Map()),
		saveVerdict: vi.fn(),
		getVerdictHistory: vi.fn().mockReturnValue([]),
		saveBacklog: vi.fn(),
		getBacklog: vi.fn().mockReturnValue([]),
		...overrides,
	}
}

function mockDeps(overrides?: Partial<SessionDeps>): SessionDeps {
	return {
		selfId: 'self-id',
		createSession: vi.fn((_roomId: string, _callbacks: PeerCallbacks) => mockSession()),
		saveSession: vi.fn(),
		createScopedStorage: vi.fn().mockReturnValue(mockScopedStorage()),
		generateSessionKeys: vi
			.fn()
			.mockReturnValue({ secretKeyHex: 'aa'.repeat(32), publicKeyHex: 'bb'.repeat(32) }),
		publishRoomState: vi.fn().mockResolvedValue(undefined),
		publishPrepDone: vi.fn().mockResolvedValue(undefined),
		queryRoomState: vi.fn().mockResolvedValue(null),
		queryPrepDone: vi.fn().mockResolvedValue([]),
		...overrides,
	}
}

function ticket(id: string, title?: string): EstimatedTicket {
	return { id, title: title ?? `Ticket ${id}` }
}

function withSession(s: SessionState, session?: PeerSession): SessionState {
	s.session = session ?? mockSession()
	return s
}

function withStorage(s: SessionState, overrides?: Partial<ScopedStorage>): SessionState {
	s.storage = mockScopedStorage(overrides)
	return s
}

function withBacklog(s: SessionState, count = 3): SessionState {
	s.backlog = Array.from({ length: count }, (_, i) => ticket(`T${i + 1}`, `Ticket ${i + 1}`))
	s.backlogIndex = 0
	return s
}

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------

describe('createInitialState', () => {
	it('returns default values', () => {
		const s = createInitialState()
		expect(s.mu).toBe(2.0)
		expect(s.sigma).toBe(0.6)
		expect(s.revealed).toBe(false)
		expect(s.session).toBeNull()
		expect(s.peerIds).toEqual([])
		expect(s.unit).toBe('points')
		expect(s.isCreator).toBe(false)
		expect(s.prepMode).toBe(false)
		expect(s.showSummary).toBe(false)
		expect(s.hasMoved).toBe(false)
		expect(s.backlogIndex).toBe(-1)
	})
})

// ---------------------------------------------------------------------------
// Derived-value helpers
// ---------------------------------------------------------------------------

describe('derived-value helpers', () => {
	it('getCurrentTicket returns undefined when no backlog', () => {
		const s = createInitialState()
		expect(getCurrentTicket(s)).toBeUndefined()
	})

	it('getCurrentTicket returns the ticket at backlogIndex', () => {
		const s = createInitialState()
		withBacklog(s)
		expect(getCurrentTicket(s)?.id).toBe('T1')
		s.backlogIndex = 2
		expect(getCurrentTicket(s)?.id).toBe('T3')
	})

	it('getEstimatedCount counts tickets with median or personal estimate', () => {
		const s = createInitialState()
		withBacklog(s)
		expect(getEstimatedCount(s)).toBe(0)
		s.myEstimates.set('T1', { mu: 2, sigma: 0.5 })
		expect(getEstimatedCount(s)).toBe(1)
		s.backlog[1].median = 5
		expect(getEstimatedCount(s)).toBe(2)
	})

	it('getAllParticipants includes self + peers', () => {
		const s = createInitialState()
		s.peerIds = ['p1', 'p2']
		expect(getAllParticipants(s, 'self')).toEqual(['self', 'p1', 'p2'])
	})

	it('getReadyCount counts ready participants', () => {
		const s = createInitialState()
		s.peerIds = ['p1', 'p2']
		s.selfReady = true
		s.readyPeers = new Set(['p1'])
		expect(getReadyCount(s, 'self')).toBe(2)
	})

	it('getAllReady is true only when everyone is ready', () => {
		const s = createInitialState()
		s.peerIds = ['p1']
		expect(getAllReady(s, 'self')).toBe(false)
		s.selfReady = true
		expect(getAllReady(s, 'self')).toBe(false)
		s.readyPeers = new Set(['p1'])
		expect(getAllReady(s, 'self')).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// handleEstimateChange
// ---------------------------------------------------------------------------

describe('handleEstimateChange', () => {
	it('updates mu, sigma, and sets hasMoved', () => {
		const s = createInitialState()
		handleEstimateChange(s, 3.0, 0.8)
		expect(s.mu).toBe(3.0)
		expect(s.sigma).toBe(0.8)
		expect(s.hasMoved).toBe(true)
	})

	it('broadcasts estimate in meeting mode', () => {
		const s = createInitialState()
		withSession(s)
		handleEstimateChange(s, 3.0, 0.8)
		expect(s.session!.sendEstimate).toHaveBeenCalledWith({ mu: 3.0, sigma: 0.8 })
	})

	it('does not broadcast in prep mode', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = true
		handleEstimateChange(s, 3.0, 0.8)
		expect(s.session!.sendEstimate).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// handleDone
// ---------------------------------------------------------------------------

describe('handleDone', () => {
	it('marks selfReady and sends ready message', () => {
		const s = createInitialState()
		withSession(s)
		handleDone(s)
		expect(s.selfReady).toBe(true)
		expect(s.session!.sendReady).toHaveBeenCalledWith({ ready: true })
	})

	it('is idempotent', () => {
		const s = createInitialState()
		withSession(s)
		s.selfReady = true
		handleDone(s)
		expect(s.session!.sendReady).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// handleForceReveal
// ---------------------------------------------------------------------------

describe('handleForceReveal', () => {
	it('sets revealed and sends', () => {
		const s = createInitialState()
		withSession(s)
		handleForceReveal(s)
		expect(s.revealed).toBe(true)
		expect(s.session!.sendReveal).toHaveBeenCalledWith({ revealed: true })
	})
})

// ---------------------------------------------------------------------------
// resetRound
// ---------------------------------------------------------------------------

describe('resetRound', () => {
	it('resets all round state to defaults', () => {
		const s = createInitialState()
		s.revealed = true
		s.selfReady = true
		s.readyPeers = new Set(['p1'])
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 3, sigma: 0.5 }]])
		s.mu = 5.0
		s.sigma = 1.0
		s.hasMoved = true

		resetRound(s)

		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
		expect(s.readyPeers.size).toBe(0)
		expect(s.peerEstimateMap.size).toBe(0)
		expect(s.mu).toBe(2.0)
		expect(s.sigma).toBe(0.6)
		expect(s.hasMoved).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// handleNext
// ---------------------------------------------------------------------------

describe('handleNext', () => {
	it('does nothing in meeting mode when not revealed', () => {
		const s = createInitialState()
		const deps = mockDeps()
		s.prepMode = false
		s.revealed = false
		handleNext(s, deps)
		// No storage set, so nothing to check — just ensure no crash
	})

	it('saves estimate when hasMoved and advances to next ticket', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.prepMode = true
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		handleNext(s, deps)

		expect(s.storage!.savePreEstimate).toHaveBeenCalledWith('T1', 3.0, 0.5)
		expect(s.backlogIndex).toBe(1)
	})

	it('does NOT save estimate when hasMoved is false', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.prepMode = true
		s.hasMoved = false

		handleNext(s, deps)

		expect(s.storage!.savePreEstimate).not.toHaveBeenCalled()
	})

	it('shows summary on last ticket', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s, 2)
		s.backlogIndex = 1
		s.prepMode = true

		handleNext(s, deps)

		expect(s.showSummary).toBe(true)
	})

	it('resets round state after advancing', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.prepMode = true
		s.selfReady = true
		s.revealed = true

		handleNext(s, deps)

		expect(s.selfReady).toBe(false)
		expect(s.hasMoved).toBe(false)
	})

	it('sends reveal:false in meeting mode', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		s.revealed = true
		s.prepMode = false

		handleNext(s, deps)

		expect(s.session!.sendReveal).toHaveBeenCalledWith({ revealed: false })
	})
})

// ---------------------------------------------------------------------------
// selectTicket
// ---------------------------------------------------------------------------

describe('selectTicket', () => {
	it('sets backlogIndex and resets round state', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withBacklog(s)
		s.selfReady = true
		s.revealed = true

		selectTicket(s, 2)

		expect(s.backlogIndex).toBe(2)
		expect(s.selfReady).toBe(false)
		expect(s.revealed).toBe(false)
	})

	it('ignores out-of-range index', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withBacklog(s)

		selectTicket(s, 99)
		expect(s.backlogIndex).toBe(0)

		selectTicket(s, -1)
		expect(s.backlogIndex).toBe(0)
	})

	it('restores personal estimate from in-memory map', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withBacklog(s)
		s.myEstimates.set('T2', { mu: 4.0, sigma: 0.3 })

		selectTicket(s, 1)

		expect(s.mu).toBe(4.0)
		expect(s.sigma).toBe(0.3)
		expect(s.hasMoved).toBe(true)
	})

	it('restores from localStorage when not in memory', () => {
		const stored = new Map([['T2', { mu: 5.0, sigma: 0.4 }]])
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s, { getPreEstimates: vi.fn().mockReturnValue(stored) })
		withBacklog(s)

		selectTicket(s, 1)

		expect(s.mu).toBe(5.0)
		expect(s.sigma).toBe(0.4)
		expect(s.hasMoved).toBe(true)
		expect(s.myEstimates.get('T2')).toEqual({ mu: 5.0, sigma: 0.4 })
	})

	it('resets to default when no saved estimate exists', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.mu = 5.0
		s.sigma = 1.0

		selectTicket(s, 1)

		expect(s.mu).toBe(2.0)
		expect(s.sigma).toBe(0.6)
	})

	it('saves current estimate before switching when hasMoved (no skipSave)', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		selectTicket(s, 1)

		expect(s.storage!.savePreEstimate).toHaveBeenCalledWith('T1', 3.0, 0.5)
	})

	it('does not save current estimate when skipSave is true', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.hasMoved = true

		selectTicket(s, 1, true)

		expect(s.storage!.savePreEstimate).not.toHaveBeenCalled()
	})

	it('syncs topic to peers in meeting mode', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.prepMode = false

		selectTicket(s, 1)

		expect(s.session!.sendTopic).toHaveBeenCalledWith({
			topic: '',
			url: undefined,
			ticketId: 'T2',
		})
	})
})

// ---------------------------------------------------------------------------
// processBacklogImport
// ---------------------------------------------------------------------------

describe('processBacklogImport', () => {
	it('sets backlog, prepMode, and selects first ticket', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		const tickets: ImportedTicket[] = [
			{ id: 'A', title: 'Alpha' },
			{ id: 'B', title: 'Beta' },
		]

		processBacklogImport(s, deps, tickets)

		expect(s.backlog.length).toBe(2)
		expect(s.prepMode).toBe(true)
		expect(s.backlogIndex).toBe(0)
		expect(s.storage!.saveBacklog).toHaveBeenCalled()
		expect(s.session!.sendBacklog).toHaveBeenCalledWith({
			tickets,
			prepMode: true,
		})
	})

	it('does nothing for empty tickets', () => {
		const s = createInitialState()
		const deps = mockDeps()
		processBacklogImport(s, deps, [])
		expect(s.backlog.length).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// handleReorder
// ---------------------------------------------------------------------------

describe('handleReorder', () => {
	it('moves ticket and updates backlogIndex', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		// Current is index 0 (T1), move T1 to index 2
		handleReorder(s, deps, 0, 2)
		expect(s.backlog[2].id).toBe('T1')
		expect(s.backlogIndex).toBe(2)
	})
})

// ---------------------------------------------------------------------------
// handleRemove
// ---------------------------------------------------------------------------

describe('handleRemove', () => {
	it('removes ticket and clears state when last ticket removed', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		s.backlog = [ticket('T1')]
		s.backlogIndex = 0

		handleRemove(s, deps, 0)

		expect(s.backlog.length).toBe(0)
		expect(s.backlogIndex).toBe(-1)
		expect(s.topic).toBe('')
	})

	it('adjusts index when removing before current', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.backlogIndex = 2

		handleRemove(s, deps, 0)

		expect(s.backlogIndex).toBe(1)
	})
})

// ---------------------------------------------------------------------------
// startMeeting
// ---------------------------------------------------------------------------

describe('startMeeting', () => {
	it('sets prepMode false and sends backlog with prepMode:false', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.prepMode = true
		s.mu = 3.0
		s.sigma = 0.5

		startMeeting(s, deps)

		expect(s.prepMode).toBe(false)
		expect(s.session!.sendBacklog).toHaveBeenCalledWith({
			tickets: s.backlog,
			prepMode: false,
		})
		expect(s.session!.sendEstimate).toHaveBeenCalledWith({ mu: 3.0, sigma: 0.5 })
		expect(s.session!.sendTopic).toHaveBeenCalledWith({
			topic: '',
			url: undefined,
			ticketId: 'T1',
		})
	})
})

// ---------------------------------------------------------------------------
// checkAutoReveal
// ---------------------------------------------------------------------------

describe('checkAutoReveal', () => {
	it('reveals when allReady in meeting mode', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = false
		s.revealed = false

		checkAutoReveal(s, true)

		expect(s.revealed).toBe(true)
		expect(s.session!.sendReveal).toHaveBeenCalledWith({ revealed: true })
	})

	it('does not reveal in prep mode', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = true

		checkAutoReveal(s, true)

		expect(s.revealed).toBe(false)
	})

	it('does not reveal when already revealed', () => {
		const s = createInitialState()
		withSession(s)
		s.revealed = true

		checkAutoReveal(s, true)

		// sendReveal not called because already revealed
		expect(s.session!.sendReveal).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// leaveSession
// ---------------------------------------------------------------------------

describe('leaveSession', () => {
	it('calls leave and resets all state', () => {
		const s = createInitialState()
		withSession(s)
		s.userName = 'Alice'
		s.peerIds = ['p1']
		s.isCreator = true
		s.prepMode = true
		s.unit = 'days'

		leaveSession(s)

		expect(s.session).toBeNull()
		expect(s.peerIds).toEqual([])
		expect(s.isCreator).toBe(false)
		expect(s.prepMode).toBe(false)
		expect(s.unit).toBe('points')
		expect(s.backlog).toEqual([])
	})
})

// ---------------------------------------------------------------------------
// joinSession
// ---------------------------------------------------------------------------

describe('joinSession', () => {
	it('sets creator state and creates P2P session', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro', 'Alice', 'points')

		expect(s.userName).toBe('Alice')
		expect(s.isCreator).toBe(true)
		expect(s.unit).toBe('points')
		expect(s.session).toBeTruthy()
		expect(deps.createSession).toHaveBeenCalledWith('te-st-ro', expect.any(Object))
		expect(deps.saveSession).toHaveBeenCalled()
	})

	it('sets joiner state (no unit selection)', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro', 'Bob', null)

		expect(s.isCreator).toBe(false)
		expect(s.unit).toBe('points') // default
	})

	it('restores persisted backlog and pre-estimates', () => {
		const savedBacklog: ImportedTicket[] = [
			{ id: 'X1', title: 'Saved ticket' },
			{ id: 'X2', title: 'Another' },
		]
		const savedEstimates = new Map([['X1', { mu: 4.0, sigma: 0.3 }]])
		const deps = mockDeps({
			createScopedStorage: vi.fn().mockReturnValue(
				mockScopedStorage({
					getBacklog: vi.fn().mockReturnValue(savedBacklog),
					getPreEstimates: vi.fn().mockReturnValue(savedEstimates),
				}),
			),
		})
		const s = createInitialState()

		joinSession(s, deps, 'te-st-ro', 'Alice', 'points')

		expect(s.backlog.length).toBe(2)
		expect(s.prepMode).toBe(true)
		expect(s.myEstimates.get('X1')).toEqual({ mu: 4.0, sigma: 0.3 })
		// First ticket selected — restores estimate
		expect(s.backlogIndex).toBe(0)
		expect(s.mu).toBe(4.0)
		expect(s.sigma).toBe(0.3)
	})

	it('applies preloaded Nostr state for joiners', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro', 'Bob', null, {
			backlog: [{ id: 'N1', title: 'From Nostr' }],
			unit: 'days',
			prepMode: true,
			topic: 'Sprint 42',
		})

		expect(s.unit).toBe('days')
		expect(s.topic).toBe('Sprint 42')
		expect(s.backlog.length).toBe(1)
		expect(s.backlog[0].title).toBe('From Nostr')
		expect(s.prepMode).toBe(true)
	})

	it('preloaded state does not override unit for creator', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro', 'Alice', 'points', {
			unit: 'days',
		})

		expect(s.unit).toBe('points')
	})

	it('localStorage backlog does not override Nostr-preloaded backlog', () => {
		const deps = mockDeps({
			createScopedStorage: vi.fn().mockReturnValue(
				mockScopedStorage({
					getBacklog: vi.fn().mockReturnValue([{ id: 'L1', title: 'Local' }]),
				}),
			),
		})
		const s = createInitialState()

		joinSession(s, deps, 'te-st-ro', 'Bob', null, {
			backlog: [{ id: 'N1', title: 'From Nostr' }],
		})

		// Nostr backlog wins — localStorage is skipped because backlog is already populated
		expect(s.backlog.length).toBe(1)
		expect(s.backlog[0].id).toBe('N1')
	})
})

// ---------------------------------------------------------------------------
// prepareJoin + connectSession (split flow for Phase 2 async)
// ---------------------------------------------------------------------------

describe('prepareJoin + connectSession', () => {
	it('prepareJoin sets state without creating P2P session', () => {
		const s = createInitialState()
		const deps = mockDeps()

		prepareJoin(s, deps, 'te-st-ro', 'Alice', 'points')

		expect(s.userName).toBe('Alice')
		expect(s.isCreator).toBe(true)
		expect(s.session).toBeNull()
		expect(deps.createSession).not.toHaveBeenCalled()
	})

	it('connectSession creates P2P session', () => {
		const s = createInitialState()
		const deps = mockDeps()

		prepareJoin(s, deps, 'te-st-ro', 'Alice', 'points')
		connectSession(s, deps, 'te-st-ro')

		expect(s.session).toBeTruthy()
		expect(deps.createSession).toHaveBeenCalledWith('te-st-ro', expect.any(Object))
	})

	it('mimics joinSession when called sequentially', () => {
		const s = createInitialState()
		const deps = mockDeps()

		prepareJoin(s, deps, 'te-st-ro', 'Bob', null)
		connectSession(s, deps, 'te-st-ro')

		expect(s.userName).toBe('Bob')
		expect(s.isCreator).toBe(false)
		expect(s.session).toBeTruthy()
	})
})

// ---------------------------------------------------------------------------
// applyNostrState
// ---------------------------------------------------------------------------

describe('applyNostrState', () => {
	it('applies room state for non-creator with empty backlog', () => {
		const s = createInitialState()
		const deps = mockDeps()
		prepareJoin(s, deps, 'te-st-ro', 'Bob', null)

		applyNostrState(
			s,
			{
				backlog: [{ id: 'N1', title: 'From Nostr' }],
				unit: 'days',
				prepMode: true,
				topic: 'Sprint 42',
			},
			[],
		)

		expect(s.backlog.length).toBe(1)
		expect(s.backlog[0].title).toBe('From Nostr')
		expect(s.unit).toBe('days')
		expect(s.topic).toBe('Sprint 42')
		expect(s.prepMode).toBe(true)
		expect(s.backlogIndex).toBe(0)
	})

	it('does not override existing backlog', () => {
		const s = createInitialState()
		const deps = mockDeps()
		prepareJoin(s, deps, 'te-st-ro', 'Bob', null)
		s.backlog = [{ id: 'E1', title: 'Existing' }]

		applyNostrState(
			s,
			{
				backlog: [{ id: 'N1', title: 'From Nostr' }],
				unit: 'days',
				prepMode: true,
				topic: '',
			},
			[],
		)

		expect(s.backlog.length).toBe(1)
		expect(s.backlog[0].id).toBe('E1')
	})

	it('ignores room state for creators', () => {
		const s = createInitialState()
		const deps = mockDeps()
		prepareJoin(s, deps, 'te-st-ro', 'Alice', 'points')

		applyNostrState(
			s,
			{
				backlog: [{ id: 'N1', title: 'From Nostr' }],
				unit: 'days',
				prepMode: true,
				topic: 'Sprint 42',
			},
			[],
		)

		expect(s.backlog.length).toBe(0)
		expect(s.unit).toBe('points')
	})

	it('applies prepDone signals', () => {
		const s = createInitialState()
		const deps = mockDeps()
		prepareJoin(s, deps, 'te-st-ro', 'Bob', null)

		applyNostrState(s, null, [{ name: 'Alice', ticketCount: 3, timestamp: 1000 }])

		expect(s.prepDone).toHaveLength(1)
		expect(s.prepDone[0].name).toBe('Alice')
	})

	it('loads pre-estimates from storage for restored backlog', () => {
		const savedEstimates = new Map([['N1', { mu: 4.0, sigma: 0.3 }]])
		const deps = mockDeps({
			createScopedStorage: vi.fn().mockReturnValue(
				mockScopedStorage({
					getPreEstimates: vi.fn().mockReturnValue(savedEstimates),
				}),
			),
		})
		const s = createInitialState()
		prepareJoin(s, deps, 'te-st-ro', 'Bob', null)

		applyNostrState(
			s,
			{
				backlog: [{ id: 'N1', title: 'From Nostr' }],
				unit: 'points',
				prepMode: true,
				topic: '',
			},
			[],
		)

		expect(s.myEstimates.get('N1')).toEqual({ mu: 4.0, sigma: 0.3 })
		expect(s.mu).toBe(4.0)
		expect(s.sigma).toBe(0.3)
	})

	it('handles null roomState gracefully', () => {
		const s = createInitialState()
		const deps = mockDeps()
		prepareJoin(s, deps, 'te-st-ro', 'Bob', null)

		applyNostrState(s, null, [])

		expect(s.backlog.length).toBe(0)
		expect(s.prepDone).toEqual([])
	})
})

// ---------------------------------------------------------------------------
// P2P callbacks
// ---------------------------------------------------------------------------

describe('createPeerCallbacks', () => {
	let s: SessionState
	let deps: SessionDeps
	let callbacks: PeerCallbacks

	beforeEach(() => {
		s = createInitialState()
		deps = mockDeps()
		withSession(s)
		withStorage(s)
		s.userName = 'Alice'
		callbacks = createPeerCallbacks(s, deps)
	})

	it('onPeerJoin adds peer and sends state', () => {
		callbacks.onPeerJoin('p1')
		expect(s.peerIds).toContain('p1')
		expect(s.session!.sendEstimate).toHaveBeenCalled()
		expect(s.session!.sendName).toHaveBeenCalled()
	})

	it('onPeerJoin sends unit and backlog when creator', () => {
		s.isCreator = true
		s.backlog = [ticket('T1')]
		callbacks.onPeerJoin('p1')
		expect(s.session!.sendUnit).toHaveBeenCalledWith({ unit: 'points' })
		expect(s.session!.sendBacklog).toHaveBeenCalled()
	})

	it('onPeerLeave removes peer from all maps', () => {
		s.peerIds = ['p1', 'p2']
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 2, sigma: 0.5 }]])
		s.peerNames = new Map([
			['p1', 'Peer1'],
			['p2', 'Peer2'],
		])
		s.readyPeers = new Set(['p1'])

		callbacks.onPeerLeave('p1')

		expect(s.peerIds).toEqual(['p2'])
		expect(s.peerEstimateMap.has('p1')).toBe(false)
		expect(s.peerNames.has('p1')).toBe(false)
		expect(s.readyPeers.has('p1')).toBe(false)
	})

	it('onEstimate adds peer estimate via clone-and-reassign', () => {
		callbacks.onEstimate({ peerId: 'p1', mu: 3, sigma: 0.5 })
		expect(s.peerEstimateMap.get('p1')).toEqual({ peerId: 'p1', mu: 3, sigma: 0.5 })
	})

	it('onReveal sets revealed state', () => {
		callbacks.onReveal(true)
		expect(s.revealed).toBe(true)
	})

	it('onReveal false triggers saveRoundToHistory + resetRound', () => {
		s.revealed = true
		s.selfReady = true
		callbacks.onReveal(false)
		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
	})

	it('onName sets peer name and tracks creator', () => {
		callbacks.onName('p1', 'Bob', true)
		expect(s.peerNames.get('p1')).toBe('Bob')
		expect(s.creatorPeerId).toBe('p1')
	})

	it('onTopic syncs backlog index by ticketId', () => {
		withBacklog(s)
		callbacks.onTopic('', undefined, 'T2')
		expect(s.backlogIndex).toBe(1)
	})

	it('onTopic sets topic text', () => {
		callbacks.onTopic('Sprint 1', 'https://example.com', undefined)
		expect(s.topic).toBe('Sprint 1')
		expect(s.topicUrl).toBe('https://example.com')
	})

	it('onReady adds/removes from readyPeers', () => {
		callbacks.onReady('p1', true)
		expect(s.readyPeers.has('p1')).toBe(true)
		callbacks.onReady('p1', false)
		expect(s.readyPeers.has('p1')).toBe(false)
	})

	it('onUnit updates unit for non-creators', () => {
		s.isCreator = false
		callbacks.onUnit('days')
		expect(s.unit).toBe('days')
		expect(deps.saveSession).toHaveBeenCalled()
	})

	it('onUnit is ignored for creators', () => {
		s.isCreator = true
		callbacks.onUnit('days')
		expect(s.unit).toBe('points')
	})

	it('onBacklog sets backlog for non-creators', () => {
		s.isCreator = false
		const tickets: ImportedTicket[] = [{ id: 'A', title: 'Alpha' }]
		callbacks.onBacklog!(tickets, true)
		expect(s.backlog.length).toBe(1)
		expect(s.prepMode).toBe(true)
		expect(s.storage!.saveBacklog).toHaveBeenCalled()
	})

	it('onBacklog is ignored for creators', () => {
		s.isCreator = true
		callbacks.onBacklog!([{ id: 'A', title: 'Alpha' }], true)
		expect(s.backlog.length).toBe(0)
	})

	it('onBacklog updates prepMode without tickets for non-creators', () => {
		s.isCreator = false
		s.prepMode = true
		callbacks.onBacklog!([], false)
		expect(s.prepMode).toBe(false)
	})

	it('onConnectionError sets error message', () => {
		callbacks.onConnectionError!('Connection failed')
		expect(s.connectionError).toBe('Connection failed')
	})
})

// ---------------------------------------------------------------------------
// End-to-end sequences (per PLAN.md)
// ---------------------------------------------------------------------------

describe('state machine sequences', () => {
	it('import CSV → prepMode → next through all → showSummary', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)

		// Import 2 tickets
		processBacklogImport(s, deps, [
			{ id: 'A', title: 'Alpha' },
			{ id: 'B', title: 'Beta' },
		])
		expect(s.prepMode).toBe(true)
		expect(s.backlogIndex).toBe(0)

		// Estimate first ticket
		handleEstimateChange(s, 3.0, 0.5)
		expect(s.hasMoved).toBe(true)

		// Next → advances to ticket B
		handleNext(s, deps)
		expect(s.backlogIndex).toBe(1)
		expect(s.hasMoved).toBe(false)

		// Estimate second ticket
		handleEstimateChange(s, 4.0, 0.7)

		// Next → last ticket → showSummary
		handleNext(s, deps)
		expect(s.showSummary).toBe(true)
	})

	it('selectTicket without moving → no save on selectTicket', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)

		// Don't move the blob, just select next ticket
		selectTicket(s, 1)

		expect(s.storage!.savePreEstimate).not.toHaveBeenCalled()
	})

	it('Start meeting → sendBacklog with prepMode:false', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.prepMode = true
		s.isCreator = true

		startMeeting(s, deps)

		expect(s.prepMode).toBe(false)
		expect(s.session!.sendBacklog).toHaveBeenCalledWith({
			tickets: s.backlog,
			prepMode: false,
		})
	})

	it('allReady → auto-reveal', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = false
		s.selfReady = true
		s.peerIds = ['p1']
		s.readyPeers = new Set(['p1'])

		const allReady = getAllReady(s, 'self-id')
		checkAutoReveal(s, allReady)

		expect(s.revealed).toBe(true)
		expect(s.session!.sendReveal).toHaveBeenCalledWith({ revealed: true })
	})

	it('full meeting cycle: join → estimate → ready → reveal → next', () => {
		const s = createInitialState()
		const sess = mockSession()
		const deps = mockDeps({
			createSession: vi.fn().mockReturnValue(sess),
		})

		// Join
		joinSession(s, deps, 'te-st-ro', 'Alice', 'points')
		expect(s.session).toBe(sess)

		// Set topic
		s.topic = 'Sprint planning'
		handleTopicChange(s, deps)
		expect(sess.sendTopic).toHaveBeenCalled()

		// Estimate
		handleEstimateChange(s, 3.0, 0.5)
		expect(sess.sendEstimate).toHaveBeenCalled()

		// Ready
		handleDone(s)
		expect(s.selfReady).toBe(true)

		// Simulate auto-reveal (normally done by effect)
		s.revealed = true

		// Next round
		handleNext(s, deps)
		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)

		// Leave
		leaveSession(s)
		expect(s.session).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// Nostr integration
// ---------------------------------------------------------------------------

describe('Nostr state publication', () => {
	it('processBacklogImport publishes room state', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		s.roomCode = 'bakitume'
		s.secretKeyHex = 'aa'.repeat(32)

		processBacklogImport(s, deps, [{ id: 'A', title: 'Alpha' }])

		expect(deps.publishRoomState).toHaveBeenCalledWith(
			'bakitume',
			'aa'.repeat(32),
			expect.objectContaining({ backlog: expect.any(Array), prepMode: true }),
		)
	})

	it('handleReorder publishes room state', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.roomCode = 'bakitume'
		s.secretKeyHex = 'aa'.repeat(32)

		handleReorder(s, deps, 0, 2)

		expect(deps.publishRoomState).toHaveBeenCalled()
	})

	it('handleRemove publishes room state', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.roomCode = 'bakitume'
		s.secretKeyHex = 'aa'.repeat(32)

		handleRemove(s, deps, 0)

		expect(deps.publishRoomState).toHaveBeenCalled()
	})

	it('startMeeting publishes room state with prepMode:false', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.prepMode = true
		s.roomCode = 'bakitume'
		s.secretKeyHex = 'aa'.repeat(32)

		startMeeting(s, deps)

		expect(deps.publishRoomState).toHaveBeenCalledWith(
			'bakitume',
			'aa'.repeat(32),
			expect.objectContaining({ prepMode: false }),
		)
	})

	it('publishes prep-done when finishing last ticket in prep mode', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s, 1) // Single ticket
		s.prepMode = true
		s.roomCode = 'bakitume'
		s.secretKeyHex = 'aa'.repeat(32)
		s.userName = 'Alice'

		handleNext(s, deps)

		expect(s.showSummary).toBe(true)
		expect(deps.publishPrepDone).toHaveBeenCalledWith(
			'bakitume',
			'aa'.repeat(32),
			expect.objectContaining({ name: 'Alice' }),
		)
	})

	it('does NOT publish prep-done in meeting mode', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s, 1)
		s.prepMode = false
		s.revealed = true
		s.roomCode = 'bakitume'
		s.secretKeyHex = 'aa'.repeat(32)

		handleNext(s, deps)

		expect(deps.publishPrepDone).not.toHaveBeenCalled()
	})
})

describe('Nostr keypair in joinSession', () => {
	it('generates and stores keypair', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro-om', 'Alice', 'points')

		expect(s.secretKeyHex).toBe('aa'.repeat(32))
		expect(s.publicKeyHex).toBe('bb'.repeat(32))
		expect(deps.generateSessionKeys).toHaveBeenCalled()
	})

	it('saves secretKey to session for creators', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro-om', 'Alice', 'points')

		expect(deps.saveSession).toHaveBeenCalledWith(
			expect.objectContaining({
				secretKey: 'aa'.repeat(32),
				publicKey: 'bb'.repeat(32),
			}),
		)
	})

	it('does not save secretKey for joiners', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro-om', 'Bob', null)

		expect(deps.saveSession).toHaveBeenCalledWith(
			expect.objectContaining({
				secretKey: undefined,
				publicKey: 'bb'.repeat(32),
			}),
		)
	})

	it('sets roomCode on state', () => {
		const s = createInitialState()
		const deps = mockDeps()

		joinSession(s, deps, 'te-st-ro-om', 'Alice', 'points')

		expect(s.roomCode).toBe('te-st-ro-om')
	})
})

describe('leaveSession cleans up Nostr state', () => {
	it('resets roomCode and keypair', () => {
		const s = createInitialState()
		s.roomCode = 'bakitume'
		s.secretKeyHex = 'aa'.repeat(32)
		s.publicKeyHex = 'bb'.repeat(32)
		s.prepDone = [{ name: 'Alice', ticketCount: 5, timestamp: 1 }]
		withSession(s)

		leaveSession(s)

		expect(s.roomCode).toBe('')
		expect(s.secretKeyHex).toBe('')
		expect(s.publicKeyHex).toBe('')
		expect(s.prepDone).toEqual([])
	})
})
