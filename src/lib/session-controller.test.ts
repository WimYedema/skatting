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
	handleAbstain,
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
	resetReadyState,
	saveRoundToHistory,
	selectTicket,
	startMeeting,
	returnToPrep,
	reEstimate,
	changeUnit,
	toggleLiveAdjust,
	mergeBacklogImport,
	skipPeer,
	unskipPeer,
	getActiveParticipants,
	hasMic,
	handOffMic,
	takeMicBack,
	claimMic,
	buildParticipantsData,
} from './session-controller'
import type { ScopedStorage } from './session-store'
import type { EstimatedTicket, ImportedTicket } from './types'
import { computeVerdict } from './verdict'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set authoritativeVerdict from current state so saveRoundToHistory can use it */
function setVerdict(s: SessionState): void {
	const result = computeVerdict('test', { mu: s.mu, sigma: s.sigma }, [])
	if (result) {
		s.authoritativeVerdict = { mu: result.mu, sigma: result.sigma, median: result.median, p10: result.p10, p90: result.p90 }
	}
}

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
		sendLiveAdjust: vi.fn().mockResolvedValue(undefined),
		sendMic: vi.fn().mockResolvedValue(undefined),
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
		expect(s.session!.sendReveal).toHaveBeenCalledWith(expect.objectContaining({ revealed: true }))
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

	it('clears conclusionMode and conclusionSigma', () => {
		const s = createInitialState()
		s.conclusionMode = 3.5
		s.conclusionSigma = 0.2

		resetRound(s)

		expect(s.conclusionMode).toBeNull()
		expect(s.conclusionSigma).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// resetReadyState
// ---------------------------------------------------------------------------

describe('resetReadyState', () => {
	it('resets ready, abstained, skipped, and peerEstimateMap', () => {
		const s = createInitialState()
		s.revealed = true
		s.selfReady = true
		s.selfAbstained = true
		s.readyPeers = new Set(['p1'])
		s.abstainedPeers = new Set(['p2'])
		s.skippedPeers = new Set(['p3'])
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 3, sigma: 0.5 }]])

		resetReadyState(s)

		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
		expect(s.selfAbstained).toBe(false)
		expect(s.readyPeers.size).toBe(0)
		expect(s.abstainedPeers.size).toBe(0)
		expect(s.skippedPeers.size).toBe(0)
		expect(s.peerEstimateMap.size).toBe(0)
	})

	it('preserves non-ready state (mu, sigma, hasMoved, liveAdjust)', () => {
		const s = createInitialState()
		s.mu = 5.0
		s.sigma = 1.0
		s.hasMoved = true
		s.liveAdjust = true

		resetReadyState(s)

		expect(s.mu).toBe(5.0)
		expect(s.sigma).toBe(1.0)
		expect(s.hasMoved).toBe(true)
		expect(s.liveAdjust).toBe(true)
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

		expect(s.myEstimates.get('T1')).toEqual({ mu: 3.0, sigma: 0.5 })
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

	it('auto-abstains when hasMoved is false (no drag)', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.prepMode = true
		s.hasMoved = false
		s.selfAbstained = false

		handleNext(s, deps)

		// After advancing, selfAbstained was set before resetRound clears it,
		// but the ticket should be in abstainedTickets
		expect(s.abstainedTickets.has('T1')).toBe(true)
	})

	it('does not auto-abstain when already explicitly abstained', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.prepMode = true
		s.hasMoved = false
		s.selfAbstained = true
		s.abstainedTickets.add('T1')

		handleNext(s, deps)

		// Should still be abstained — no double-add or error
		expect(s.abstainedTickets.has('T1')).toBe(true)
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

		expect(s.session!.sendReveal).toHaveBeenCalledWith(expect.objectContaining({ revealed: false }))
	})

	it('sends topic to peers when advancing in meeting mode', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.revealed = true
		s.prepMode = false

		handleNext(s, deps)

		expect(s.session!.sendTopic).toHaveBeenCalledWith({
			topic: '',
			url: undefined,
			ticketId: 'T2',
		})
	})

	it('does NOT save to history during prep mode', () => {
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

		expect(s.history).toHaveLength(0)
		expect(s.storage!.saveVerdict).not.toHaveBeenCalled()
	})

	it('does NOT send reveal during prep mode', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withBacklog(s)
		s.prepMode = true

		handleNext(s, deps)

		expect(s.session!.sendReveal).not.toHaveBeenCalled()
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

		selectTicket(s, 1, { skipSave: true })

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

	it('broadcasts restored estimate in meeting mode after ticket switch', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.prepMode = false
		s.myEstimates.set('T2', { mu: 4.0, sigma: 0.3 })

		selectTicket(s, 1)

		expect(s.session!.sendEstimate).toHaveBeenCalledWith({ mu: 4.0, sigma: 0.3 })
	})

	it('does NOT broadcast estimate in prep mode after ticket switch', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.prepMode = true
		s.myEstimates.set('T2', { mu: 4.0, sigma: 0.3 })

		selectTicket(s, 1)

		expect(s.session!.sendEstimate).not.toHaveBeenCalled()
	})

	it('broadcasts estimate on peer side after incoming topic switch', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.prepMode = false
		s.myEstimates.set('T2', { mu: 4.0, sigma: 0.3 })

		// Simulate peer side: skipSave + skipSend (from onTopic handler)
		selectTicket(s, 1, { skipSave: true, skipSend: true })

		// Even with skipSend, estimate should still be broadcast
		expect(s.session!.sendEstimate).toHaveBeenCalledWith({ mu: 4.0, sigma: 0.3 })
	})

	it('sends topic with skipSave but not skipSend', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.prepMode = false

		selectTicket(s, 1, { skipSave: true })

		expect(s.session!.sendTopic).toHaveBeenCalledWith({
			topic: '',
			url: undefined,
			ticketId: 'T2',
		})
	})

	it('does not send topic when skipSend is true', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.prepMode = false

		selectTicket(s, 1, { skipSend: true })

		expect(s.session!.sendTopic).not.toHaveBeenCalled()
	})

	it('does NOT save to history when switching tickets in prep mode', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.prepMode = true
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		selectTicket(s, 1)

		expect(s.history).toHaveLength(0)
		expect(s.storage!.saveVerdict).not.toHaveBeenCalled()
		// But pre-estimate should still be saved
		expect(s.storage!.savePreEstimate).toHaveBeenCalledWith('T1', 3.0, 0.5)
	})

	it('does NOT save to history when switching tickets in meeting mode without reveal', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.prepMode = false
		s.revealed = false
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		selectTicket(s, 1)

		expect(s.history).toHaveLength(0)
		expect(s.storage!.saveVerdict).not.toHaveBeenCalled()
		// But pre-estimate should still be saved
		expect(s.storage!.savePreEstimate).toHaveBeenCalledWith('T1', 3.0, 0.5)
	})

	it('saves to history when switching tickets in meeting mode after reveal', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.prepMode = false
		s.revealed = true
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		selectTicket(s, 1)

		expect(s.history).toHaveLength(1)
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
// returnToPrep
// ---------------------------------------------------------------------------

describe('returnToPrep', () => {
	it('sets prepMode true, resets round, and broadcasts', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.isCreator = true
		s.prepMode = false
		s.revealed = true
		s.selfReady = true
		s.readyPeers = new Set(['p1'])

		returnToPrep(s)

		expect(s.prepMode).toBe(true)
		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
		expect(s.readyPeers.size).toBe(0)
		expect(s.session!.sendBacklog).toHaveBeenCalledWith({
			tickets: s.backlog,
			prepMode: true,
		})
	})

	it('does nothing for non-creator', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = false
		s.prepMode = false

		returnToPrep(s)

		expect(s.prepMode).toBe(false)
		expect(s.session!.sendBacklog).not.toHaveBeenCalled()
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
		expect(s.session!.sendReveal).toHaveBeenCalledWith(expect.objectContaining({ revealed: true }))
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

	it('blocks auto-reveal when mic holder is stale', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = false
		s.revealed = false
		s.micHolder = 'peer-a'
		s.peerLastSeen = new Map([['peer-a', Date.now() - 20_000]])

		checkAutoReveal(s, true)

		expect(s.revealed).toBe(false)
		expect(s.session!.sendReveal).not.toHaveBeenCalled()
	})

	it('allows auto-reveal when mic holder is NOT stale', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = false
		s.revealed = false
		s.micHolder = 'peer-a'
		s.peerLastSeen = new Map([['peer-a', Date.now() - 1_000]])

		checkAutoReveal(s, true)

		expect(s.revealed).toBe(true)
	})

	it('allows auto-reveal when no remote mic holder (creator holds mic)', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = false
		s.revealed = false
		s.micHolder = null

		checkAutoReveal(s, true)

		expect(s.revealed).toBe(true)
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
		expect(deps.createSession).toHaveBeenCalledWith('te-st-ro', expect.any(Object), expect.objectContaining({ roomCode: 'te-st-ro' }))
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
		expect(deps.createSession).toHaveBeenCalledWith('te-st-ro', expect.any(Object), expect.objectContaining({ roomCode: 'te-st-ro' }))
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

	it('onPeerJoin ignores self peerId', () => {
		callbacks.onPeerJoin(deps.selfId)
		expect(s.peerIds).not.toContain(deps.selfId)
		expect(s.session!.sendEstimate).not.toHaveBeenCalled()
	})

	it('onPeerJoin rejects peer when room is full', () => {
		// Fill up to MAX_PEERS
		for (let i = 0; i < 15; i++) {
			s.peerIds.push(`peer-${i}`)
		}
		callbacks.onPeerJoin('overflow-peer')
		expect(s.peerIds).not.toContain('overflow-peer')
		expect(s.session!.sendEstimate).not.toHaveBeenCalled()
	})

	it('onPeerJoin sends unit and backlog when creator', () => {
		s.isCreator = true
		s.backlog = [ticket('T1')]
		callbacks.onPeerJoin('p1')
		expect(s.session!.sendUnit).toHaveBeenCalledWith({ unit: 'points' })
		expect(s.session!.sendBacklog).toHaveBeenCalled()
	})

	it('onPeerLeave removes peer from peerIds but keeps peerNames for reconnect tracking', () => {
		s.peerIds = ['p1', 'p2']
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 2, sigma: 0.5 }]])
		s.peerNames = new Map([
			['p1', 'Peer1'],
			['p2', 'Peer2'],
		])
		s.readyPeers = new Set(['p1'])
		s.peerLastSeen = new Map([['p1', 1000]])

		callbacks.onPeerLeave('p1')

		expect(s.peerIds).toEqual(['p2'])
		expect(s.peerEstimateMap.has('p1')).toBe(false)
		// peerNames and peerLastSeen are kept so disconnected peers remain visible
		expect(s.peerNames.has('p1')).toBe(true)
		expect(s.peerLastSeen.has('p1')).toBe(true)
		expect(s.readyPeers.has('p1')).toBe(false)
	})

	it('onEstimate adds peer estimate via clone-and-reassign', () => {
		callbacks.onEstimate({ peerId: 'p1', mu: 3, sigma: 0.5 })
		expect(s.peerEstimateMap.get('p1')).toEqual({ peerId: 'p1', mu: 3, sigma: 0.5 })
	})

	it('onReveal sets revealed state', () => {
		callbacks.onReveal({ revealed: true })
		expect(s.revealed).toBe(true)
	})

	it('onReveal false triggers saveRoundToHistory + resetRound', () => {
		s.revealed = true
		s.selfReady = true
		callbacks.onReveal({ revealed: false })
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

	it('onTopic resets round state when switching tickets', () => {
		withBacklog(s)
		s.revealed = true
		s.selfReady = true
		s.readyPeers = new Set(['p1'])
		callbacks.onTopic('', undefined, 'T2')
		expect(s.backlogIndex).toBe(1)
		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
		expect(s.readyPeers.size).toBe(0)
	})

	it('onTopic restores saved blob position', () => {
		withBacklog(s)
		s.myEstimates.set('T2', { mu: 4.0, sigma: 0.3 })
		callbacks.onTopic('', undefined, 'T2')
		expect(s.mu).toBe(4.0)
		expect(s.sigma).toBe(0.3)
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
		expect(s.session!.sendReveal).toHaveBeenCalledWith(expect.objectContaining({ revealed: true }))
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

// ---------------------------------------------------------------------------
// handleAbstain
// ---------------------------------------------------------------------------

describe('handleAbstain', () => {
	it('marks selfReady and selfAbstained, sends ready with abstained flag', () => {
		const s = createInitialState()
		withSession(s)
		handleAbstain(s)
		expect(s.selfReady).toBe(true)
		expect(s.selfAbstained).toBe(true)
		expect(s.session!.sendReady).toHaveBeenCalledWith({ ready: true, abstained: true })
	})

	it('is idempotent when already ready', () => {
		const s = createInitialState()
		withSession(s)
		s.selfReady = true
		handleAbstain(s)
		expect(s.selfAbstained).toBe(false)
		expect(s.session!.sendReady).not.toHaveBeenCalled()
	})

	it('counts as ready for auto-reveal', () => {
		const s = createInitialState()
		withSession(s)
		s.peerIds = ['p1']
		s.readyPeers = new Set(['p1'])
		handleAbstain(s)
		expect(getAllReady(s, 'self')).toBe(true)
	})

	it('is cleared by resetRound', () => {
		const s = createInitialState()
		s.selfAbstained = true
		s.abstainedPeers = new Set(['p1'])
		resetRound(s)
		expect(s.selfAbstained).toBe(false)
		expect(s.abstainedPeers.size).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// onReady callback with abstain
// ---------------------------------------------------------------------------

describe('onReady callback with abstain', () => {
	let s: SessionState
	let callbacks: PeerCallbacks

	beforeEach(() => {
		s = createInitialState()
		const deps = mockDeps()
		callbacks = createPeerCallbacks(s, deps)
	})

	it('tracks abstained peers', () => {
		callbacks.onReady('p1', true, true)
		expect(s.readyPeers.has('p1')).toBe(true)
		expect(s.abstainedPeers.has('p1')).toBe(true)
	})

	it('does not mark non-abstaining peers as abstained', () => {
		callbacks.onReady('p1', true)
		expect(s.readyPeers.has('p1')).toBe(true)
		expect(s.abstainedPeers.has('p1')).toBe(false)
	})

	it('clears abstained on unready', () => {
		callbacks.onReady('p1', true, true)
		callbacks.onReady('p1', false)
		expect(s.readyPeers.has('p1')).toBe(false)
		expect(s.abstainedPeers.has('p1')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// abstain persistence across ticket navigation
// ---------------------------------------------------------------------------

describe('abstain persistence', () => {
	it('remembers abstained ticket when navigating away and back', () => {
		const s = createInitialState()
		withSession(s)
		s.backlog = [
			{ id: 'T1', title: 'First' },
			{ id: 'T2', title: 'Second' },
		]
		s.backlogIndex = 0
		s.prepMode = true

		handleAbstain(s)
		expect(s.selfAbstained).toBe(true)
		expect(s.abstainedTickets.has('T1')).toBe(true)

		// Navigate to T2
		selectTicket(s, 1)
		expect(s.selfAbstained).toBe(false)

		// Navigate back to T1
		selectTicket(s, 0)
		expect(s.selfAbstained).toBe(true)
	})

	it('clears abstain when user drags on an abstained ticket', () => {
		const s = createInitialState()
		withSession(s)
		s.backlog = [{ id: 'T1', title: 'First' }]
		s.backlogIndex = 0

		handleAbstain(s)
		expect(s.selfAbstained).toBe(true)

		handleEstimateChange(s, 3.0, 0.5)
		expect(s.selfAbstained).toBe(false)
		expect(s.abstainedTickets.has('T1')).toBe(false)
	})

	it('does not save estimate for abstained ticket in handleNext', () => {
		const s = createInitialState()
		withSession(s)
		s.backlog = [
			{ id: 'T1', title: 'First' },
			{ id: 'T2', title: 'Second' },
		]
		s.backlogIndex = 0
		s.prepMode = true
		s.hasMoved = true

		handleAbstain(s)
		handleNext(s, mockDeps())

		expect(s.myEstimates.has('T1')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// reEstimate
// ---------------------------------------------------------------------------

describe('reEstimate', () => {
	it('resets revealed and ready state, keeps blob positions', () => {
		const s = createInitialState()
		withSession(s)
		s.revealed = true
		s.selfReady = true
		s.selfAbstained = true
		s.readyPeers = new Set(['p1'])
		s.abstainedPeers = new Set(['p2'])
		s.mu = 3.0
		s.sigma = 0.5

		reEstimate(s)

		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
		expect(s.selfAbstained).toBe(false)
		expect(s.readyPeers.size).toBe(0)
		expect(s.abstainedPeers.size).toBe(0)
		// Blob position preserved
		expect(s.mu).toBe(3.0)
		expect(s.sigma).toBe(0.5)
	})

	it('sends reEstimate flag in RevealMessage', () => {
		const s = createInitialState()
		withSession(s)
		s.revealed = true

		reEstimate(s)

		expect(s.session!.sendReveal).toHaveBeenCalledWith({
			revealed: false,
			reEstimate: true,
		})
	})

	it('also clears skippedPeers and peerEstimateMap via resetReadyState', () => {
		const s = createInitialState()
		withSession(s)
		s.revealed = true
		s.skippedPeers = new Set(['p1'])
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 3, sigma: 0.5 }]])

		reEstimate(s)

		expect(s.skippedPeers.size).toBe(0)
		expect(s.peerEstimateMap.size).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// onReveal with reEstimate flag
// ---------------------------------------------------------------------------

describe('onReveal with reEstimate flag', () => {
	let s: SessionState
	let callbacks: PeerCallbacks
	const deps = mockDeps()

	beforeEach(() => {
		s = createInitialState()
		withSession(s)
		s.revealed = true
		s.selfReady = true
		s.readyPeers = new Set(['p1'])
		s.abstainedPeers = new Set(['p2'])
		s.selfAbstained = true
		s.mu = 3.0
		s.sigma = 0.5
		callbacks = createPeerCallbacks(s, deps)
	})

	it('reEstimate=true resets ready but keeps blob positions', () => {
		callbacks.onReveal({ revealed: false, reEstimate: true })

		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
		expect(s.selfAbstained).toBe(false)
		expect(s.readyPeers.size).toBe(0)
		expect(s.abstainedPeers.size).toBe(0)
		// Blob position preserved
		expect(s.mu).toBe(3.0)
		expect(s.sigma).toBe(0.5)
	})

	it('reEstimate=false (next round) saves history and resets', () => {
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 2, sigma: 0.4 }]])
		callbacks.onReveal({ revealed: false })

		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
	})

	it('reEstimate=undefined (next round) saves history and resets', () => {
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 2, sigma: 0.4 }]])
		callbacks.onReveal({ revealed: false })

		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// revisit verdict overwrite
// ---------------------------------------------------------------------------

describe('revisit verdict overwrite', () => {
	it('re-estimating a completed ticket overwrites the verdict', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.prepMode = false
		s.hasMoved = true
		s.mu = 2.0
		s.sigma = 0.4

		// First estimation round — save verdict for T1
		setVerdict(s)
		saveRoundToHistory(s)
		expect(s.backlog[0].median).toBeDefined()
		const oldMedian = s.backlog[0].median!
		expect(s.history).toHaveLength(1)

		// Navigate to T2, then back to T1 for re-estimation
		selectTicket(s, 1, { skipSave: true })
		selectTicket(s, 0, { skipSave: true })

		// Re-estimate T1 with different values
		s.mu = 4.0
		s.sigma = 0.3
		s.hasMoved = true
		setVerdict(s)
		saveRoundToHistory(s)

		// Verdict should be overwritten, not duplicated
		expect(s.history).toHaveLength(1)
		expect(s.backlog[0].median).toBeDefined()
		expect(s.backlog[0].median).not.toBe(oldMedian)
	})

	it('selectTicket saves current verdict before switching', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.prepMode = false
		s.revealed = true
		s.hasMoved = true
		s.mu = 3.0
		s.sigma = 0.5

		selectTicket(s, 1) // should save T1 verdict before switching

		expect(s.backlog[0].median).toBeDefined()
		expect(s.backlogIndex).toBe(1)
	})
})

// ---------------------------------------------------------------------------
// changeUnit
// ---------------------------------------------------------------------------

describe('changeUnit', () => {
	it('updates unit and broadcasts to peers', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = true
		s.unit = 'points'

		changeUnit(s, 'days')

		expect(s.unit).toBe('days')
		expect(s.session!.sendUnit).toHaveBeenCalledWith({ unit: 'days' })
	})

	it('does nothing for non-creator', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = false
		s.unit = 'points'

		changeUnit(s, 'days')

		expect(s.unit).toBe('points')
		expect(s.session!.sendUnit).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// mergeBacklogImport
// ---------------------------------------------------------------------------

describe('mergeBacklogImport', () => {
	it('appends new tickets, skipping duplicates by id', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s) // T1, T2, T3
		const d = mockDeps()

		mergeBacklogImport(s, d, [
			{ id: 'T2', title: 'Duplicate' },
			{ id: 'T4', title: 'New one' },
		])

		expect(s.backlog).toHaveLength(4)
		expect(s.backlog[3].id).toBe('T4')
		expect(s.backlog[3].title).toBe('New one')
		// T2 unchanged
		expect(s.backlog[1].title).toBe('Ticket 2')
	})

	it('does nothing when all tickets are duplicates', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		const d = mockDeps()

		mergeBacklogImport(s, d, [{ id: 'T1', title: 'Dup' }])

		expect(s.backlog).toHaveLength(3)
		expect(s.session!.sendBacklog).not.toHaveBeenCalled()
	})

	it('broadcasts merged backlog to peers', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		const d = mockDeps()

		mergeBacklogImport(s, d, [{ id: 'T4', title: 'New' }])

		expect(s.session!.sendBacklog).toHaveBeenCalledWith({
			tickets: s.backlog,
			prepMode: s.prepMode,
		})
	})

	it('preserves backlogIndex on merge', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		s.backlogIndex = 1
		const d = mockDeps()

		mergeBacklogImport(s, d, [{ id: 'T4', title: 'New' }])

		expect(s.backlogIndex).toBe(1)
	})

	it('pre-populates myEstimates from storage for new tickets', () => {
		const s = createInitialState()
		withSession(s)
		withBacklog(s)
		withStorage(s, {
			getPreEstimates: vi.fn().mockReturnValue(
				new Map([
					['T4', { mu: 4.0, sigma: 0.3 }],
					['T5', { mu: 5.0, sigma: 0.2 }],
				]),
			),
		})
		const d = mockDeps()

		mergeBacklogImport(s, d, [
			{ id: 'T4', title: 'Four' },
			{ id: 'T5', title: 'Five' },
		])

		expect(s.myEstimates.get('T4')).toEqual({ mu: 4.0, sigma: 0.3 })
		expect(s.myEstimates.get('T5')).toEqual({ mu: 5.0, sigma: 0.2 })
	})
})

// ---------------------------------------------------------------------------
// toggleLiveAdjust
// ---------------------------------------------------------------------------

describe('toggleLiveAdjust', () => {
	it('toggles liveAdjust and broadcasts to peers', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = true

		expect(s.liveAdjust).toBe(false)

		toggleLiveAdjust(s)
		expect(s.liveAdjust).toBe(true)
		expect(s.session!.sendLiveAdjust).toHaveBeenCalledWith({ liveAdjust: true })

		toggleLiveAdjust(s)
		expect(s.liveAdjust).toBe(false)
		expect(s.session!.sendLiveAdjust).toHaveBeenCalledWith({ liveAdjust: false })
	})

	it('works for non-creators (mic holder can toggle)', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = false

		toggleLiveAdjust(s)
		expect(s.liveAdjust).toBe(true)
		expect(s.session!.sendLiveAdjust).toHaveBeenCalledWith({ liveAdjust: true })
	})
})

// ---------------------------------------------------------------------------
// onLiveAdjust callback
// ---------------------------------------------------------------------------

describe('onLiveAdjust callback', () => {
	it('sets liveAdjust state from peer message', () => {
		const s = createInitialState()
		withSession(s)
		const deps = mockDeps()
		const callbacks = createPeerCallbacks(s, deps)

		callbacks.onLiveAdjust(true)
		expect(s.liveAdjust).toBe(true)

		callbacks.onLiveAdjust(false)
		expect(s.liveAdjust).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// resetRound resets liveAdjust
// ---------------------------------------------------------------------------

describe('resetRound resets liveAdjust', () => {
	it('sets liveAdjust back to false', () => {
		const s = createInitialState()
		s.liveAdjust = true
		s.revealed = true

		resetRound(s)

		expect(s.liveAdjust).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// Selective Reveal (5.4)
// ---------------------------------------------------------------------------

describe('skipPeer', () => {
	it('adds peer to skippedPeers when creator', () => {
		const s = createInitialState()
		s.isCreator = true
		s.peerIds = ['a', 'b']

		skipPeer(s, 'a')

		expect(s.skippedPeers.has('a')).toBe(true)
		expect(s.skippedPeers.has('b')).toBe(false)
	})

	it('works for non-creators (mic holder can skip)', () => {
		const s = createInitialState()
		s.isCreator = false
		s.peerIds = ['a']

		skipPeer(s, 'a')

		expect(s.skippedPeers.has('a')).toBe(true)
	})
})

describe('unskipPeer', () => {
	it('removes peer from skippedPeers', () => {
		const s = createInitialState()
		s.skippedPeers = new Set(['a'])

		unskipPeer(s, 'a')

		expect(s.skippedPeers.has('a')).toBe(false)
	})
})

describe('getActiveParticipants', () => {
	it('excludes skipped peers', () => {
		const s = createInitialState()
		s.peerIds = ['a', 'b', 'c']
		s.skippedPeers = new Set(['b'])

		const active = getActiveParticipants(s, 'self')

		expect(active).toContain('self')
		expect(active).toContain('a')
		expect(active).not.toContain('b')
		expect(active).toContain('c')
	})
})

describe('getAllReady with skipped peers', () => {
	it('returns true when all non-skipped peers are ready', () => {
		const s = createInitialState()
		s.peerIds = ['a', 'b']
		s.selfReady = true
		s.readyPeers = new Set(['a'])
		s.skippedPeers = new Set(['b'])

		expect(getAllReady(s, 'self')).toBe(true)
	})

	it('returns false when a non-skipped peer is not ready', () => {
		const s = createInitialState()
		s.peerIds = ['a', 'b']
		s.selfReady = true
		s.readyPeers = new Set()
		s.skippedPeers = new Set(['b'])

		expect(getAllReady(s, 'self')).toBe(false)
	})
})

describe('getReadyCount with skipped peers', () => {
	it('excludes skipped peers from count', () => {
		const s = createInitialState()
		s.peerIds = ['a', 'b', 'c']
		s.selfReady = true
		s.readyPeers = new Set(['a'])
		s.skippedPeers = new Set(['b'])

		// active: self + a + c = 3, ready: self + a = 2
		expect(getReadyCount(s, 'self')).toBe(2)
	})
})

describe('onReady un-skips peer', () => {
	it('removes peer from skippedPeers when they send ready', () => {
		const s = createInitialState()
		s.session = mockSession()
		s.isCreator = true
		s.peerIds = ['a']
		s.skippedPeers = new Set(['a'])

		const callbacks = createPeerCallbacks(s, mockDeps())
		callbacks.onReady('a', true)

		expect(s.skippedPeers.has('a')).toBe(false)
		expect(s.readyPeers.has('a')).toBe(true)
	})
})

describe('resetRound resets skippedPeers', () => {
	it('clears skippedPeers', () => {
		const s = createInitialState()
		s.skippedPeers = new Set(['a', 'b'])

		resetRound(s)

		expect(s.skippedPeers.size).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// Mic (facilitator handoff)
// ---------------------------------------------------------------------------

describe('hasMic', () => {
	it('returns true for creator when micHolder is null', () => {
		const s = createInitialState()
		s.isCreator = true
		s.micHolder = null
		expect(hasMic(s, 'self')).toBe(true)
	})

	it('returns false for non-creator when micHolder is null', () => {
		const s = createInitialState()
		s.isCreator = false
		s.micHolder = null
		expect(hasMic(s, 'self')).toBe(false)
	})

	it('returns true when micHolder matches selfId', () => {
		const s = createInitialState()
		s.isCreator = false
		s.micHolder = 'peer-a'
		expect(hasMic(s, 'peer-a')).toBe(true)
	})

	it('returns false when micHolder is another peer', () => {
		const s = createInitialState()
		s.isCreator = true
		s.micHolder = 'peer-b'
		expect(hasMic(s, 'self')).toBe(false)
	})
})

describe('handOffMic', () => {
	it('sets micHolder and broadcasts', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = true

		handOffMic(s, 'self', 'peer-a')

		expect(s.micHolder).toBe('peer-a')
		expect(s.session!.sendMic).toHaveBeenCalledWith({ holder: 'peer-a' })
	})

	it('does nothing for non-creators', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = false

		handOffMic(s, 'self', 'peer-a')

		expect(s.micHolder).toBeNull()
	})
})

describe('takeMicBack', () => {
	it('resets micHolder to null and broadcasts', () => {
		const s = createInitialState()
		withSession(s)
		s.isCreator = true
		s.micHolder = 'peer-a'
		s.micDropMessage = 'someone dropped'

		takeMicBack(s)

		expect(s.micHolder).toBeNull()
		expect(s.micDropMessage).toBe('')
		expect(s.session!.sendMic).toHaveBeenCalledWith({ holder: null })
	})
})

describe('claimMic', () => {
	it('claims mic when mic-drop is active', () => {
		const s = createInitialState()
		withSession(s)
		s.micDropMessage = 'Bob dropped the mic 🎤'

		claimMic(s, 'peer-b')

		expect(s.micHolder).toBe('peer-b')
		expect(s.micDropMessage).toBe('')
		expect(s.session!.sendMic).toHaveBeenCalledWith({ holder: 'peer-b' })
	})

	it('does nothing when no mic-drop is active', () => {
		const s = createInitialState()
		withSession(s)
		s.micDropMessage = ''

		claimMic(s, 'peer-b')

		expect(s.micHolder).toBeNull()
	})
})

describe('mic-drop on peer leave', () => {
	it('triggers mic-drop when mic holder disconnects', () => {
		const s = createInitialState()
		withSession(s)
		s.peerIds = ['peer-a']
		s.peerNames = new Map([['peer-a', 'Alice']])
		s.micHolder = 'peer-a'

		const callbacks = createPeerCallbacks(s, mockDeps())
		callbacks.onPeerLeave('peer-a')

		expect(s.micHolder).toBeNull()
		expect(s.micDropMessage).toBe('Alice dropped the mic 🎤')
	})

	it('does not trigger mic-drop for regular peer leave', () => {
		const s = createInitialState()
		withSession(s)
		s.peerIds = ['peer-a', 'peer-b']
		s.peerNames = new Map([['peer-a', 'Alice'], ['peer-b', 'Bob']])
		s.micHolder = 'peer-a'

		const callbacks = createPeerCallbacks(s, mockDeps())
		callbacks.onPeerLeave('peer-b')

		expect(s.micHolder).toBe('peer-a')
		expect(s.micDropMessage).toBe('')
	})
})

describe('onMic callback', () => {
	it('updates micHolder from peer message', () => {
		const s = createInitialState()
		withSession(s)

		const callbacks = createPeerCallbacks(s, mockDeps())
		callbacks.onMic!('peer-a')

		expect(s.micHolder).toBe('peer-a')
		expect(s.micDropMessage).toBe('')
	})

	it('resets micHolder to null', () => {
		const s = createInitialState()
		withSession(s)
		s.micHolder = 'peer-a'

		const callbacks = createPeerCallbacks(s, mockDeps())
		callbacks.onMic!(null)

		expect(s.micHolder).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// Authoritative verdict flow
// ---------------------------------------------------------------------------

describe('authoritative verdict', () => {
	it('handleForceReveal sets authoritativeVerdict on state', () => {
		const s = createInitialState()
		withSession(s)
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		handleForceReveal(s)

		expect(s.authoritativeVerdict).not.toBeNull()
		expect(s.authoritativeVerdict!.mu).toBeCloseTo(3.0, 1)
		expect(s.authoritativeVerdict!.sigma).toBeCloseTo(0.5, 1)
		expect(s.authoritativeVerdict!.median).toBeGreaterThan(0)
		expect(s.authoritativeVerdict!.p10).toBeGreaterThan(0)
		expect(s.authoritativeVerdict!.p90).toBeGreaterThan(0)
	})

	it('handleForceReveal sends estimates snapshot with self peerId', () => {
		const s = createInitialState()
		withSession(s)
		s.mu = 3.0
		s.sigma = 0.5
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 2, sigma: 0.4 }]])

		handleForceReveal(s)

		const call = vi.mocked(s.session!.sendReveal).mock.calls[0][0] as { estimates: Array<{ peerId: string }> }
		const peerIds = call.estimates.map((e) => e.peerId)
		expect(peerIds).toContain('self-id')
		expect(peerIds).toContain('p1')
	})

	it('handleForceReveal excludes abstained self from estimates', () => {
		const s = createInitialState()
		withSession(s)
		s.selfAbstained = true
		s.peerEstimateMap = new Map([['p1', { peerId: 'p1', mu: 2, sigma: 0.4 }]])

		handleForceReveal(s)

		const call = vi.mocked(s.session!.sendReveal).mock.calls[0][0] as { estimates: Array<{ peerId: string }> }
		const peerIds = call.estimates.map((e) => e.peerId)
		expect(peerIds).not.toContain('self-id')
		expect(peerIds).toContain('p1')
	})

	it('handleForceReveal excludes abstained peers from estimates', () => {
		const s = createInitialState()
		withSession(s)
		s.mu = 3.0
		s.sigma = 0.5
		s.peerEstimateMap = new Map([
			['p1', { peerId: 'p1', mu: 2, sigma: 0.4 }],
			['p2', { peerId: 'p2', mu: 4, sigma: 0.3 }],
		])
		s.abstainedPeers = new Set(['p2'])

		handleForceReveal(s)

		const call = vi.mocked(s.session!.sendReveal).mock.calls[0][0] as { estimates: Array<{ peerId: string }> }
		const peerIds = call.estimates.map((e) => e.peerId)
		expect(peerIds).toContain('p1')
		expect(peerIds).not.toContain('p2')
	})

	it('saveRoundToHistory returns early when no authoritativeVerdict', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		s.authoritativeVerdict = null
		s.topic = 'Some topic'

		saveRoundToHistory(s)

		expect(s.history).toHaveLength(0)
		expect(s.storage!.saveVerdict).not.toHaveBeenCalled()
	})

	it('saveRoundToHistory uses authoritativeVerdict', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		s.topic = 'Test topic'
		s.authoritativeVerdict = { mu: 3, sigma: 0.5, median: 20, p10: 10, p90: 40 }

		saveRoundToHistory(s)

		expect(s.history).toHaveLength(1)
		expect(s.history[0].mu).toBe(3)
		expect(s.history[0].sigma).toBe(0.5)
		expect(s.authoritativeVerdict).toBeNull()
	})

	it('saveRoundToHistory applies verdictOverride to median', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.authoritativeVerdict = { mu: 3, sigma: 0.5, median: 20, p10: 10, p90: 40 }

		saveRoundToHistory(s, 13)

		expect(s.backlog[0].median).toBe(13)
	})

	it('saveRoundToHistory clears authoritativeVerdict after use', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		s.topic = 'X'
		s.authoritativeVerdict = { mu: 3, sigma: 0.5, median: 20, p10: 10, p90: 40 }

		saveRoundToHistory(s)

		expect(s.authoritativeVerdict).toBeNull()
	})

	it('handleNext builds verdict payload before saveRoundToHistory', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.revealed = true
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		handleNext(s, deps)

		// History should have been saved (verdict was built before saveRoundToHistory)
		expect(s.history).toHaveLength(1)
		expect(s.history[0].mu).toBeCloseTo(3.0, 1)
	})

	it('handleNext sends verdict in reveal payload for meeting mode', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		s.revealed = true
		s.prepMode = false
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		handleNext(s, deps)

		const call = vi.mocked(s.session!.sendReveal).mock.calls[0][0]
		expect(call).toMatchObject({
			revealed: false,
			verdict: expect.objectContaining({ mu: expect.any(Number), median: expect.any(Number) }),
		})
	})

	it('checkAutoReveal sets authoritativeVerdict', () => {
		const s = createInitialState()
		withSession(s)
		s.prepMode = false
		s.revealed = false
		s.mu = 3.0
		s.sigma = 0.5

		checkAutoReveal(s, true)

		expect(s.authoritativeVerdict).not.toBeNull()
		expect(s.authoritativeVerdict!.mu).toBeCloseTo(3.0, 1)
	})

	it('onReveal (revealed=true) applies authoritative estimate snapshot', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		const callbacks = createPeerCallbacks(s, deps)

		// Receiver already has stale peer estimates
		s.peerEstimateMap = new Map([['old-peer', { peerId: 'old-peer', mu: 1, sigma: 0.1 }]])

		callbacks.onReveal({
			revealed: true,
			estimates: [
				{ peerId: 'mic-holder', mu: 3, sigma: 0.5 },
				{ peerId: 'p1', mu: 2, sigma: 0.4 },
			],
			verdict: { mu: 2.5, sigma: 0.45, median: 12, p10: 7, p90: 21 },
		})

		// Old peer should be replaced by snapshot
		expect(s.peerEstimateMap.has('old-peer')).toBe(false)
		// Mic holder's estimate should be kept as a peer
		expect(s.peerEstimateMap.get('mic-holder')).toEqual({ peerId: 'mic-holder', mu: 3, sigma: 0.5 })
		// p1 should be in the map
		expect(s.peerEstimateMap.get('p1')).toEqual({ peerId: 'p1', mu: 2, sigma: 0.4 })
		// Verdict stashed for later saveRoundToHistory
		expect(s.authoritativeVerdict).toEqual({ mu: 2.5, sigma: 0.45, median: 12, p10: 7, p90: 21 })
	})

	it('onReveal (revealed=false) saves verdict from mic holder and advances', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		withStorage(s)
		s.topic = 'Current topic'
		s.revealed = true

		const callbacks = createPeerCallbacks(s, deps)
		callbacks.onReveal({
			revealed: false,
			verdict: { mu: 3, sigma: 0.5, median: 20, p10: 10, p90: 40 },
		})

		// Should have saved history using mic holder's verdict
		expect(s.history).toHaveLength(1)
		expect(s.history[0].mu).toBe(3)
		// Round should be reset
		expect(s.revealed).toBe(false)
		expect(s.selfReady).toBe(false)
	})

	it('onReveal (reEstimate) does NOT set authoritativeVerdict', () => {
		const s = createInitialState()
		const deps = mockDeps()
		withSession(s)
		s.revealed = true

		const callbacks = createPeerCallbacks(s, deps)
		callbacks.onReveal({ revealed: false, reEstimate: true })

		expect(s.authoritativeVerdict).toBeFalsy()
		expect(s.selfReady).toBe(false)
	})

	it('resetRound clears authoritativeVerdict', () => {
		const s = createInitialState()
		s.authoritativeVerdict = { mu: 3, sigma: 0.5, median: 20, p10: 10, p90: 40 }

		resetRound(s)

		expect(s.authoritativeVerdict).toBeNull()
	})

	it('selectTicket saves verdict before switching', () => {
		const s = createInitialState()
		withSession(s)
		withStorage(s)
		withBacklog(s)
		s.prepMode = false
		s.revealed = true
		s.mu = 3.0
		s.sigma = 0.5
		s.hasMoved = true

		selectTicket(s, 1)

		// Switching should have saved the first ticket's verdict
		expect(s.history).toHaveLength(1)
		expect(s.backlogIndex).toBe(1)
	})
})

// ---------------------------------------------------------------------------
// buildParticipantsData
// ---------------------------------------------------------------------------

describe('buildParticipantsData', () => {
	it('returns self entry first', () => {
		const s = createInitialState()
		s.userName = 'Alice'
		s.isCreator = true
		s.selfReady = true

		const result = buildParticipantsData(s, 'self-id', true, 15_000, Date.now())

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			id: 'self-id',
			name: 'Alice',
			isSelf: true,
			isReady: true,
			hasMic: true,
			isLeader: true,
			isOffline: false,
		})
	})

	it('includes connected peers with colors and ready state', () => {
		const s = createInitialState()
		s.userName = 'Alice'
		s.peerIds = ['peer-1', 'peer-2']
		s.peerNames = new Map([['peer-1', 'Bob'], ['peer-2', 'Carol']])
		s.readyPeers = new Set(['peer-1'])
		s.peerLastSeen = new Map([['peer-1', Date.now()], ['peer-2', Date.now()]])

		const result = buildParticipantsData(s, 'self-id', false, 15_000, Date.now())

		expect(result).toHaveLength(3)
		expect(result[1]).toMatchObject({ id: 'peer-1', name: 'Bob', isReady: true, isSelf: false })
		expect(result[2]).toMatchObject({ id: 'peer-2', name: 'Carol', isReady: false, isSelf: false })
		expect(result[1].color).toBeTruthy()
	})

	it('marks stale peers', () => {
		const s = createInitialState()
		s.userName = 'Alice'
		s.peerIds = ['peer-1']
		s.peerNames = new Map([['peer-1', 'Bob']])
		const now = Date.now()
		s.peerLastSeen = new Map([['peer-1', now - 20_000]])

		const result = buildParticipantsData(s, 'self-id', false, 15_000, now)

		expect(result[1].isStale).toBe(true)
	})

	it('appends offline creator when creator is known but disconnected', () => {
		const s = createInitialState()
		s.userName = 'Bob'
		s.isCreator = false
		s.creatorName = 'Alice'
		s.creatorPeerId = null

		const result = buildParticipantsData(s, 'self-id', false, 15_000, Date.now())

		expect(result).toHaveLength(2)
		expect(result[1]).toMatchObject({
			id: '__creator__',
			name: 'Alice',
			isLeader: true,
			isOffline: true,
		})
	})

	it('does not append offline creator when self is creator', () => {
		const s = createInitialState()
		s.userName = 'Alice'
		s.isCreator = true
		s.creatorName = 'Alice'
		s.creatorPeerId = null

		const result = buildParticipantsData(s, 'self-id', true, 15_000, Date.now())

		expect(result).toHaveLength(1)
	})

	it('reflects skipped and abstained peers', () => {
		const s = createInitialState()
		s.userName = 'Alice'
		s.peerIds = ['peer-1', 'peer-2']
		s.peerNames = new Map([['peer-1', 'Bob'], ['peer-2', 'Carol']])
		s.skippedPeers = new Set(['peer-1'])
		s.abstainedPeers = new Set(['peer-2'])
		s.peerLastSeen = new Map([['peer-1', Date.now()], ['peer-2', Date.now()]])

		const result = buildParticipantsData(s, 'self-id', false, 15_000, Date.now())

		expect(result[1]).toMatchObject({ isSkipped: true, isAbstained: false })
		expect(result[2]).toMatchObject({ isSkipped: false, isAbstained: true })
	})

	it('marks mic holder peer', () => {
		const s = createInitialState()
		s.userName = 'Alice'
		s.peerIds = ['peer-1']
		s.peerNames = new Map([['peer-1', 'Bob']])
		s.micHolder = 'peer-1'
		s.peerLastSeen = new Map([['peer-1', Date.now()]])

		const result = buildParticipantsData(s, 'self-id', false, 15_000, Date.now())

		expect(result[1]).toMatchObject({ hasMic: true })
	})
})
