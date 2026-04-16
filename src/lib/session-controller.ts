import { MAX_PEERS } from './config'
import type { NostrSessionKeys, PrepDoneSignal, RoomState } from './nostr-state'
import type { PeerCallbacks, PeerSession } from './peer'
import type { SavedSession, ScopedStorage } from './session-store'
import type { EstimatedTicket, HistoryEntry, ImportedTicket, PeerEstimate, RevealMessage, VerdictSnapshot } from './types'
import { applyVerdict, computeVerdict, upsertHistory } from './verdict'
import type { VerdictResult } from './verdict'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SessionState {
	mu: number
	sigma: number
	revealed: boolean
	session: PeerSession | null
	peerIds: string[]
	peerEstimateMap: Map<string, PeerEstimate>
	userName: string
	topic: string
	topicUrl: string
	peerNames: Map<string, string>
	creatorPeerId: string | null
	/** Name of the room creator (from Nostr room state, available even when creator is offline) */
	creatorName: string
	readyPeers: Set<string>
	abstainedPeers: Set<string>
	skippedPeers: Set<string>
	selfReady: boolean
	selfAbstained: boolean
	history: HistoryEntry[]
	persistentHistory: HistoryEntry[]
	showPersistentHistory: boolean
	unit: string
	isCreator: boolean
	connectionError: string
	backlog: EstimatedTicket[]
	backlogIndex: number
	myEstimates: Map<string, { mu: number; sigma: number }>
	abstainedTickets: Set<string>
	hasMoved: boolean
	hasEverDragged: boolean
	liveAdjust: boolean
	prepMode: boolean
	showSummary: boolean
	/** Room code (needed for Nostr key derivation and publication) */
	roomCode: string
	/** Nostr keypair for event signing */
	secretKeyHex: string
	publicKeyHex: string
	/** Prep-done signals from other participants */
	prepDone: PrepDoneSignal[]
	/** User-scoped localStorage (created at join time) */
	storage: ScopedStorage | null
	/** Peer ID of the current 🎤 holder, null = creator holds mic */
	micHolder: string | null
	/** Toast-style message for mic drop */
	micDropMessage: string
	/** Timestamp of last received ping/message per peer (for liveness detection) */
	peerLastSeen: Map<string, number>
	/** Authoritative verdict from the mic holder — set before saveRoundToHistory */
	authoritativeVerdict: VerdictSnapshot | null
}

export function createInitialState(): SessionState {
	return {
		mu: 2.0,
		sigma: 0.6,
		revealed: false,
		session: null,
		peerIds: [],
		peerEstimateMap: new Map(),
		userName: '',
		topic: '',
		topicUrl: '',
		peerNames: new Map(),
		creatorPeerId: null,
		creatorName: '',
		readyPeers: new Set(),
		abstainedPeers: new Set(),
		skippedPeers: new Set(),
		selfReady: false,
		selfAbstained: false,
		history: [],
		persistentHistory: [],
		showPersistentHistory: true,
		unit: 'points',
		isCreator: false,
		connectionError: '',
		backlog: [],
		backlogIndex: -1,
		myEstimates: new Map(),
		abstainedTickets: new Set(),
		hasMoved: false,
		hasEverDragged: false,
		liveAdjust: false,
		prepMode: false,
		showSummary: false,
		roomCode: '',
		secretKeyHex: '',
		publicKeyHex: '',
		prepDone: [],
		storage: null,
		micHolder: null,
		micDropMessage: '',
		peerLastSeen: new Map(),
		_authoritativeVerdict: null,
	}
}

// ---------------------------------------------------------------------------
// Dependencies (injected for testability)
// ---------------------------------------------------------------------------

export interface SessionDeps {
	selfId: string
	createSession: (
		roomId: string,
		callbacks: PeerCallbacks,
		nostrConfig?: { roomCode: string; secretKeyHex: string },
	) => PeerSession
	saveSession: (session: SavedSession) => void
	createScopedStorage: (roomId: string, userName: string) => ScopedStorage
	generateSessionKeys: () => NostrSessionKeys
	publishRoomState: (roomCode: string, secretKeyHex: string, state: RoomState) => Promise<void>
	publishPrepDone: (roomCode: string, secretKeyHex: string, signal: PrepDoneSignal) => Promise<void>
	queryRoomState: (roomCode: string) => Promise<RoomState | null>
	queryPrepDone: (roomCode: string) => Promise<PrepDoneSignal[]>
}

// ---------------------------------------------------------------------------
// Nostr publication helper (fire-and-forget)
// ---------------------------------------------------------------------------

function publishState(s: SessionState, deps: SessionDeps): void {
	if (!s.roomCode || !s.secretKeyHex) return
	const state: RoomState = {
		backlog: s.backlog,
		unit: s.unit,
		prepMode: s.prepMode,
		topic: s.topic.trim(),
		creatorName: s.userName,
	}
	deps.publishRoomState(s.roomCode, s.secretKeyHex, state).catch(() => {
		// Relay publish failures are non-fatal
	})
}

// ---------------------------------------------------------------------------
// Derived-value helpers (pure functions)
// ---------------------------------------------------------------------------

export function getCurrentTicket(s: SessionState): EstimatedTicket | undefined {
	return s.backlogIndex >= 0 && s.backlogIndex < s.backlog.length
		? s.backlog[s.backlogIndex]
		: undefined
}

export function getEstimatedCount(s: SessionState): number {
	return s.backlog.filter((t) => t.median != null || s.myEstimates.has(t.id)).length
}

export function getAllParticipants(s: SessionState, selfId: string): string[] {
	return [selfId, ...s.peerIds]
}

export function getActiveParticipants(s: SessionState, selfId: string): string[] {
	return getAllParticipants(s, selfId).filter((id) => !s.skippedPeers.has(id))
}

export function getReadyCount(s: SessionState, selfId: string): number {
	return getActiveParticipants(s, selfId).filter((id) =>
		id === selfId ? s.selfReady : s.readyPeers.has(id),
	).length
}

export function getAllReady(s: SessionState, selfId: string): boolean {
	const active = getActiveParticipants(s, selfId)
	return active.length > 0 && getReadyCount(s, selfId) === active.length
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export function handleEstimateChange(s: SessionState, mu: number, sigma: number): void {
	s.mu = mu
	s.sigma = sigma
	s.hasMoved = true
	s.hasEverDragged = true
	// Dragging clears abstain — user changed their mind
	if (s.selfAbstained) {
		s.selfAbstained = false
		const ticket = getCurrentTicket(s)
		if (ticket) s.abstainedTickets.delete(ticket.id)
	}
	if (!s.prepMode) {
		s.session?.sendEstimate({ mu, sigma })
	}
}

export function handleDone(s: SessionState): void {
	if (s.selfReady) return
	s.selfReady = true
	// Always send estimate before ready — prep→meeting transition may not have sent it
	if (s.hasMoved && !s.selfAbstained) {
		s.session?.sendEstimate({ mu: s.mu, sigma: s.sigma })
	}
	s.session?.sendReady({ ready: true })
}

export function handleAbstain(s: SessionState): void {
	if (s.selfReady) return
	s.selfReady = true
	s.selfAbstained = true
	const ticket = getCurrentTicket(s)
	if (ticket) s.abstainedTickets.add(ticket.id)
	s.session?.sendReady({ ready: true, abstained: true })
}

export function persistSession(s: SessionState, deps: SessionDeps): void {
	if (!s.session) return
	deps.saveSession({
		roomId: s.session.roomId,
		userName: s.userName,
		topic: s.topic.trim(),
		unit: s.unit,
		isCreator: s.isCreator,
		peerNames: Array.from(s.peerNames.values()),
		lastUsed: Date.now(),
	})
}

export function handleTopicChange(s: SessionState, deps: SessionDeps): void {
	const trimmed = s.topic.trim()
	if (/^https?:\/\//.test(trimmed) && !s.topicUrl) {
		s.topicUrl = trimmed
	}
	const currentTicket = getCurrentTicket(s)
	s.session?.sendTopic({
		topic: trimmed,
		url: s.topicUrl || undefined,
		ticketId: currentTicket?.id,
	})
	persistSession(s, deps)
}

/** Sentinel peerId for the mic holder's own estimate in the snapshot. */
const SELF_ESTIMATE_ID = '__self__'

/**
 * Build an authoritative reveal payload including the estimate snapshot and
 * computed verdict from the mic holder's local state. Also sets
 * `s.authoritativeVerdict` so the subsequent `saveRoundToHistory` uses it.
 */
function buildRevealPayload(s: SessionState, extra?: Partial<RevealMessage>): RevealMessage {
	const peerEsts = Array.from(s.peerEstimateMap.values())
		.filter((pe) => !s.abstainedPeers.has(pe.peerId))

	const estimates = [
		...(s.selfAbstained ? [] : [{ peerId: SELF_ESTIMATE_ID, mu: s.mu, sigma: s.sigma }]),
		...peerEsts.map((pe) => ({ peerId: pe.peerId, mu: pe.mu, sigma: pe.sigma })),
	]

	const currentTicket = getCurrentTicket(s)
	const label = currentTicket?.title || s.topic.trim() || `Item ${s.history.length + 1}`
	const myEstimate = s.selfAbstained ? null : { mu: s.mu, sigma: s.sigma }
	const peerEstimatesForVerdict = peerEsts.map((pe) => ({ mu: pe.mu, sigma: pe.sigma }))

	let verdict: VerdictSnapshot | undefined
	const result = myEstimate
		? computeVerdict(label, myEstimate, peerEstimatesForVerdict)
		: peerEstimatesForVerdict.length > 0
			? computeVerdict(label, peerEstimatesForVerdict[0], peerEstimatesForVerdict.slice(1))
			: null
	if (result) {
		verdict = { mu: result.mu, sigma: result.sigma, median: result.median, p10: result.p10, p90: result.p90 }
	}

	// Set the authoritative verdict so saveRoundToHistory uses it (both sender and receiver)
	s.authoritativeVerdict = verdict ?? null

	return { revealed: true, estimates, verdict, ...extra }
}

export function handleForceReveal(s: SessionState): void {
	s.revealed = true
	s.session?.sendReveal(buildRevealPayload(s))
}

export function addOrUpdateHistory(s: SessionState, entry: HistoryEntry): void {
	s.history = upsertHistory(s.history, entry)
	if (s.session && s.storage) {
		const currentTicket = getCurrentTicket(s)
		s.storage.saveVerdict({
			...entry,
			unit: s.unit,
			roomId: s.session.roomId,
			timestamp: Date.now(),
			ticketId: currentTicket?.id,
		})
		s.persistentHistory = s.storage.getVerdictHistory(s.unit)
	}
}

export function saveRoundToHistory(s: SessionState, verdictOverride: number | null = null): void {
	const currentTicket = getCurrentTicket(s)
	const label = currentTicket?.title || s.topic.trim() || `Item ${s.history.length + 1}`

	if (!s.authoritativeVerdict) return

	const av = s.authoritativeVerdict
	let verdict: VerdictResult = {
		historyEntry: { label, mu: av.mu, sigma: av.sigma },
		median: av.median,
		p10: av.p10,
		p90: av.p90,
		mu: av.mu,
		sigma: av.sigma,
	}
	s.authoritativeVerdict = null

	if (verdictOverride != null) {
		verdict = { ...verdict, median: verdictOverride }
	}

	if (currentTicket) {
		applyVerdict(currentTicket, verdict, s.unit)
	}
	addOrUpdateHistory(s, verdict.historyEntry)
}

export function skipPeer(s: SessionState, peerId: string): void {
	s.skippedPeers = new Set(s.skippedPeers).add(peerId)
}

export function unskipPeer(s: SessionState, peerId: string): void {
	const next = new Set(s.skippedPeers)
	next.delete(peerId)
	s.skippedPeers = next
}

export function resetRound(s: SessionState): void {
	s.revealed = false
	s.selfReady = false
	s.selfAbstained = false
	s.readyPeers = new Set()
	s.abstainedPeers = new Set()
	s.skippedPeers = new Set()
	s.peerEstimateMap = new Map()
	s.mu = 2.0
	s.sigma = 0.6
	s.hasMoved = false
	s.liveAdjust = false
	s.authoritativeVerdict = null
}

export function handleNext(
	s: SessionState,
	deps: SessionDeps,
	verdictOverride: number | null = null,
): void {
	if (!s.prepMode && !s.revealed) return
	const currentTicket = getCurrentTicket(s)
	if (currentTicket && s.hasMoved && !s.selfAbstained) {
		s.myEstimates.set(currentTicket.id, { mu: s.mu, sigma: s.sigma })
		if (s.storage) s.storage.savePreEstimate(currentTicket.id, s.mu, s.sigma)
	}
	// Auto-abstain: if user never dragged and didn't explicitly estimate, treat as skip
	if (currentTicket && !s.hasMoved && !s.selfAbstained) {
		s.selfAbstained = true
		s.abstainedTickets.add(currentTicket.id)
	}

	// Build authoritative verdict payload before saveRoundToHistory consumes state
	const revealPayload = buildRevealPayload(s, { revealed: false })
	// Apply verdictOverride to the outgoing payload if the facilitator positioned a call
	if (verdictOverride != null && revealPayload.verdict) {
		revealPayload.verdict = { ...revealPayload.verdict, median: verdictOverride }
	}

	saveRoundToHistory(s, verdictOverride)
	resetRound(s)
	if (!s.prepMode) {
		s.session?.sendReveal(revealPayload)
	}

	if (s.backlog.length > 0 && s.backlogIndex < s.backlog.length - 1) {
		selectTicket(s, s.backlogIndex + 1, true)
	} else if (s.backlog.length > 0) {
		s.showSummary = true
		// Signal prep completion to Nostr if in prep mode
		if (s.prepMode && s.roomCode && s.secretKeyHex) {
			deps
				.publishPrepDone(s.roomCode, s.secretKeyHex, {
					name: s.userName,
					ticketCount: getEstimatedCount(s),
					timestamp: Date.now(),
				})
				.catch(() => {})
		}
	}
}

export function selectTicket(s: SessionState, index: number, skipSave = false): void {
	if (index < 0 || index >= s.backlog.length) return

	const currentTicket = getCurrentTicket(s)
	if (!skipSave && currentTicket && s.hasMoved && !s.selfAbstained) {
		s.myEstimates.set(currentTicket.id, { mu: s.mu, sigma: s.sigma })
		if (s.storage) s.storage.savePreEstimate(currentTicket.id, s.mu, s.sigma)
		buildRevealPayload(s) // sets authoritativeVerdict for saveRoundToHistory
		saveRoundToHistory(s)
	}

	s.revealed = false
	s.selfReady = false
	s.selfAbstained = false
	s.readyPeers = new Set()
	s.abstainedPeers = new Set()
	s.skippedPeers = new Set()
	s.peerEstimateMap = new Map()

	s.backlogIndex = index
	const ticket = s.backlog[index]

	// Restore abstain state for this ticket
	if (s.abstainedTickets.has(ticket.id)) {
		s.selfAbstained = true
		s.mu = 2.0
		s.sigma = 0.6
		s.hasMoved = false
	} else {
		const saved = s.myEstimates.get(ticket.id)
		if (saved) {
			s.mu = saved.mu
			s.sigma = saved.sigma
			s.hasMoved = true
		} else if (s.storage) {
			const stored = s.storage.getPreEstimates()
			const pre = stored.get(ticket.id)
			if (pre) {
				s.mu = pre.mu
				s.sigma = pre.sigma
				s.myEstimates.set(ticket.id, pre)
				s.hasMoved = true
			} else {
				s.mu = 2.0
				s.sigma = 0.6
				s.hasMoved = false
			}
		} else {
			s.mu = 2.0
			s.sigma = 0.6
			s.hasMoved = false
		}
	}

	if (!s.prepMode) {
		s.session?.sendTopic({
			topic: '',
			url: ticket.url,
			ticketId: ticket.id,
		})
	}
}

export function processBacklogImport(
	s: SessionState,
	deps: SessionDeps,
	tickets: ImportedTicket[],
): void {
	if (tickets.length === 0) return
	s.backlog = tickets.map((t) => ({ ...t }))
	s.backlogIndex = -1
	s.prepMode = true
	if (s.storage) s.storage.saveBacklog(tickets)
	s.session?.sendBacklog({ tickets, prepMode: true })
	selectTicket(s, 0)
	publishState(s, deps)
}

export function mergeBacklogImport(
	s: SessionState,
	deps: SessionDeps,
	tickets: ImportedTicket[],
): void {
	if (tickets.length === 0) return
	const existingIds = new Set(s.backlog.map((t) => t.id))
	const newTickets = tickets.filter((t) => !existingIds.has(t.id))
	if (newTickets.length === 0) return
	s.backlog = [...s.backlog, ...newTickets.map((t) => ({ ...t }))]
	// Pre-populate myEstimates from storage for merged tickets
	if (s.storage) {
		const stored = s.storage.getPreEstimates()
		for (const t of newTickets) {
			const pre = stored.get(t.id)
			if (pre) s.myEstimates.set(t.id, pre)
		}
		s.storage.saveBacklog(s.backlog)
	}
	s.session?.sendBacklog({ tickets: s.backlog, prepMode: s.prepMode })
	publishState(s, deps)
}

export function handleReorder(
	s: SessionState,
	deps: SessionDeps,
	fromIndex: number,
	toIndex: number,
): void {
	const item = s.backlog[fromIndex]
	s.backlog.splice(fromIndex, 1)
	s.backlog.splice(toIndex, 0, item)
	if (s.backlogIndex === fromIndex) {
		s.backlogIndex = toIndex
	} else if (fromIndex < s.backlogIndex && toIndex >= s.backlogIndex) {
		s.backlogIndex--
	} else if (fromIndex > s.backlogIndex && toIndex <= s.backlogIndex) {
		s.backlogIndex++
	}
	if (s.session) {
		s.session.sendBacklog({ tickets: s.backlog, prepMode: s.prepMode })
		if (s.storage) s.storage.saveBacklog(s.backlog)
	}
	publishState(s, deps)
}

export function handleRemove(s: SessionState, deps: SessionDeps, index: number): void {
	if (index < 0 || index >= s.backlog.length) return
	s.backlog.splice(index, 1)
	if (s.backlog.length === 0) {
		s.backlogIndex = -1
		s.topic = ''
		s.topicUrl = ''
	} else if (index < s.backlogIndex) {
		s.backlogIndex--
	} else if (index === s.backlogIndex) {
		const newIndex = Math.min(s.backlogIndex, s.backlog.length - 1)
		selectTicket(s, newIndex)
	}
	if (s.session) {
		s.session.sendBacklog({ tickets: s.backlog, prepMode: s.prepMode })
		if (s.storage) s.storage.saveBacklog(s.backlog)
	}
	publishState(s, deps)
}

export function startMeeting(s: SessionState, deps: SessionDeps): void {
	s.prepMode = false
	const currentTicket = getCurrentTicket(s)
	s.session?.sendBacklog({ tickets: s.backlog, prepMode: false })
	s.session?.sendEstimate({ mu: s.mu, sigma: s.sigma })
	if (currentTicket) {
		s.session?.sendTopic({ topic: '', url: currentTicket.url, ticketId: currentTicket.id })
	}
	publishState(s, deps)
}

export function returnToPrep(s: SessionState): void {
	if (!s.isCreator) return
	s.prepMode = true
	resetRound(s)
	s.session?.sendBacklog({ tickets: s.backlog, prepMode: true })
}

/**
 * Stale threshold for mic holder warning (ms).
 * Exported so App.svelte can use the same value for its derived warning.
 */
export const MIC_HOLDER_STALE_MS = 15_000

export function checkAutoReveal(s: SessionState, allReady: boolean): void {
	if (!s.prepMode && allReady && !s.revealed) {
		// If mic holder is a remote peer and stale, skip auto-reveal
		// (the UI will show a warning banner instead)
		if (s.micHolder) {
			const lastSeen = s.peerLastSeen.get(s.micHolder)
			if (lastSeen != null && Date.now() - lastSeen > MIC_HOLDER_STALE_MS) {
				return
			}
		}
		s.revealed = true
		s.session?.sendReveal(buildRevealPayload(s))
	}
}

export function toggleLiveAdjust(s: SessionState): void {
	s.liveAdjust = !s.liveAdjust
	s.session?.sendLiveAdjust({ liveAdjust: s.liveAdjust })
}

export function reEstimate(s: SessionState): void {
	s.revealed = false
	s.selfReady = false
	s.selfAbstained = false
	s.readyPeers = new Set()
	s.abstainedPeers = new Set()
	s.session?.sendReveal({ revealed: false, reEstimate: true })
}

export function changeUnit(s: SessionState, newUnit: string): void {
	if (!s.isCreator) return
	s.unit = newUnit
	s.session?.sendUnit({ unit: newUnit })
	if (s.storage) s.persistentHistory = s.storage.getVerdictHistory(newUnit)
}

// ---------------------------------------------------------------------------
// Mic (facilitator handoff)
// ---------------------------------------------------------------------------

/** Does the local user currently hold the 🎤? */
export function hasMic(s: SessionState, selfId: string): boolean {
	if (s.micHolder === null) return s.isCreator
	return s.micHolder === selfId
}

/** Creator hands the 🎤 to a peer */
export function handOffMic(s: SessionState, selfId: string, peerId: string): void {
	if (!s.isCreator) return
	s.micHolder = peerId
	s.session?.sendMic({ holder: peerId })
}

/** Take the 🎤 back (creator only) */
export function takeMicBack(s: SessionState): void {
	if (!s.isCreator) return
	s.micHolder = null
	s.micDropMessage = ''
	s.session?.sendMic({ holder: null })
}

/** Claim the open 🎤 after a mic-drop (anyone) */
export function claimMic(s: SessionState, selfId: string): void {
	// Can only claim when mic-drop is active (holder disconnected)
	if (s.micDropMessage === '') return
	s.micHolder = selfId
	s.micDropMessage = ''
	s.session?.sendMic({ holder: selfId })
}

export function leaveSession(s: SessionState): void {
	s.session?.leave()
	s.session = null
	s.peerIds = []
	s.peerNames = new Map()
	s.creatorPeerId = null
	s.creatorName = ''
	resetRound(s)
	s.history = []
	s.unit = 'points'
	s.isCreator = false
	s.connectionError = ''
	s.backlog = []
	s.backlogIndex = -1
	s.topicUrl = ''
	s.myEstimates = new Map()
	s.prepMode = false
	s.roomCode = ''
	s.secretKeyHex = ''
	s.publicKeyHex = ''
	s.prepDone = []
	s.storage = null
	s.micHolder = null
	s.micDropMessage = ''
	s.peerLastSeen = new Map()
}

// ---------------------------------------------------------------------------
// P2P callback factory
// ---------------------------------------------------------------------------

/** Mark a peer as recently seen (clone-and-reassign for Svelte reactivity) */
function touchPeer(s: SessionState, peerId: string): void {
	s.peerLastSeen = new Map(s.peerLastSeen).set(peerId, Date.now())
}

export function createPeerCallbacks(s: SessionState, deps: SessionDeps): PeerCallbacks {
	return {
		onPeerJoin(peerId: string) {
			if (s.peerIds.length >= MAX_PEERS) {
				// Room is full — don't track this peer
				return
			}
			s.peerIds = [...s.peerIds, peerId]
			touchPeer(s, peerId)
			s.session?.sendEstimate({ mu: s.mu, sigma: s.sigma })
			s.session?.sendName({ name: s.userName, isCreator: s.isCreator })
			if (s.isCreator) {
				s.session?.sendUnit({ unit: s.unit })
				if (s.backlog.length > 0) {
					s.session?.sendBacklog({ tickets: s.backlog, prepMode: s.prepMode })
				}
				if (s.liveAdjust) {
					s.session?.sendLiveAdjust({ liveAdjust: true })
				}
				if (s.micHolder !== null) {
					s.session?.sendMic({ holder: s.micHolder })
				}
			}
			if (s.topic) {
				const currentTicket = getCurrentTicket(s)
				s.session?.sendTopic({
					topic: s.topic,
					url: s.topicUrl || undefined,
					ticketId: currentTicket?.id,
				})
			}
			if (s.selfReady) {
				s.session?.sendReady({ ready: true, abstained: s.selfAbstained || undefined })
			}
		},
		onPeerLeave(peerId: string) {
			s.peerIds = s.peerIds.filter((id) => id !== peerId)
			const em = new Map(s.peerEstimateMap)
			em.delete(peerId)
			s.peerEstimateMap = em
			// Keep peerNames — they represent "expected participants" for reconnect
			const leaverName = s.peerNames.get(peerId) ?? 'Someone'
			const rp = new Set(s.readyPeers)
			rp.delete(peerId)
			s.readyPeers = rp
			const ap = new Set(s.abstainedPeers)
			ap.delete(peerId)
			s.abstainedPeers = ap
			const sp = new Set(s.skippedPeers)
			sp.delete(peerId)
			s.skippedPeers = sp
			// Mic-drop: if the 🎤 holder disconnects, open it up
			if (s.micHolder === peerId) {
				s.micHolder = null
				s.micDropMessage = `${leaverName} dropped the mic 🎤`
			}
			if (s.creatorPeerId === peerId) {
				s.creatorPeerId = null
			}
			// Keep peerLastSeen — used to show "last seen" for disconnected peers
		},
		onEstimate(estimate: PeerEstimate) {
			touchPeer(s, estimate.peerId)
			s.peerEstimateMap = new Map(s.peerEstimateMap).set(estimate.peerId, estimate)
		},
		onReveal(msg: RevealMessage) {
			s.revealed = msg.revealed
			if (msg.revealed && msg.estimates) {
				// Apply authoritative estimate snapshot from the mic holder
				const next = new Map<string, PeerEstimate>()
				for (const e of msg.estimates) {
					if (e.peerId !== SELF_ESTIMATE_ID) {
						next.set(e.peerId, { peerId: e.peerId, mu: e.mu, sigma: e.sigma })
					}
				}
				s.peerEstimateMap = next
				s.authoritativeVerdict = msg.verdict ?? null
			} else if (!msg.revealed && msg.reEstimate) {
				// Re-estimate: reset ready state but keep positions
				s.selfReady = false
				s.selfAbstained = false
				s.readyPeers = new Set()
				s.abstainedPeers = new Set()
				s.skippedPeers = new Set()
			} else if (!msg.revealed) {
				// Advance to next ticket — apply authoritative verdict from mic holder
				s.authoritativeVerdict = msg.verdict ?? null
				saveRoundToHistory(s)
				resetRound(s)
			}
		},
		onName(peerId: string, name: string, peerIsCreator: boolean) {
			touchPeer(s, peerId)
			s.peerNames = new Map(s.peerNames).set(peerId, name)
			if (peerIsCreator) {
				s.creatorPeerId = peerId
				s.creatorName = name
			}
			persistSession(s, deps)
		},
		onTopic(newTopic: string, url?: string, ticketId?: string) {
			if (ticketId && s.backlog.length > 0) {
				const idx = s.backlog.findIndex((t) => t.id === ticketId)
				if (idx >= 0) selectTicket(s, idx, true)
			}
			if (newTopic) {
				s.topic = newTopic
				s.topicUrl = url ?? ''
			}
		},
		onReady(peerId: string, ready: boolean, abstained?: boolean) {
			touchPeer(s, peerId)
			if (ready) {
				s.readyPeers = new Set(s.readyPeers).add(peerId)
				if (abstained) {
					s.abstainedPeers = new Set(s.abstainedPeers).add(peerId)
				}
				// Un-skip if they came back and readied up
				if (s.skippedPeers.has(peerId)) {
					const sp = new Set(s.skippedPeers)
					sp.delete(peerId)
					s.skippedPeers = sp
				}
			} else {
				const rp = new Set(s.readyPeers)
				rp.delete(peerId)
				s.readyPeers = rp
				const ap = new Set(s.abstainedPeers)
				ap.delete(peerId)
				s.abstainedPeers = ap
			}
		},
		onUnit(peerUnit: string) {
			if (!s.isCreator) {
				s.unit = peerUnit
				if (s.storage) s.persistentHistory = s.storage.getVerdictHistory(peerUnit)
				persistSession(s, deps)
			}
		},
		onLiveAdjust(liveAdjust: boolean) {
			s.liveAdjust = liveAdjust
		},
		onMic(holder: string | null) {
			s.micHolder = holder
			s.micDropMessage = ''
		},
		onBacklog(tickets: ImportedTicket[], peerPrepMode?: boolean) {
			if (!s.isCreator && tickets.length > 0) {
				s.backlog = tickets.map((t) => ({ ...t }))
				s.backlogIndex = -1
				s.prepMode = peerPrepMode ?? true
				if (s.storage) s.storage.saveBacklog(tickets)
			} else if (!s.isCreator && peerPrepMode !== undefined) {
				s.prepMode = peerPrepMode
			}
			// When transitioning from prep to meeting, send current estimate
			if (peerPrepMode === false && s.hasMoved && !s.selfAbstained) {
				s.session?.sendEstimate({ mu: s.mu, sigma: s.sigma })
			}
		},
		onConnectionError(message: string) {
			s.connectionError = message
		},
		onPing(peerId: string) {
			touchPeer(s, peerId)
		},
	}
}

// ---------------------------------------------------------------------------
// Session join / create
// ---------------------------------------------------------------------------

/** State that can be pre-loaded from Nostr relays before connecting P2P. */
export interface PreloadedState {
	backlog?: ImportedTicket[]
	unit?: string
	prepMode?: boolean
	topic?: string
	prepDone?: PrepDoneSignal[]
}

/**
 * Phase 1: Set up local state for join (synchronous).
 * Phase 2 can call this, then query Nostr, then call connectSession.
 */
export function prepareJoin(
	s: SessionState,
	deps: SessionDeps,
	roomId: string,
	name: string,
	selectedUnit: string | null,
	preloaded?: PreloadedState,
): void {
	s.userName = name
	s.isCreator = selectedUnit !== null
	if (selectedUnit) s.unit = selectedUnit
	s.connectionError = ''
	s.roomCode = roomId

	// Create user-scoped storage (isolates per room+user in localStorage)
	s.storage = deps.createScopedStorage(roomId, name)

	// Generate or reuse Nostr keypair
	const keys = deps.generateSessionKeys()
	s.secretKeyHex = keys.secretKeyHex
	s.publicKeyHex = keys.publicKeyHex

	// Apply pre-loaded state from Nostr (if any) before localStorage
	if (preloaded) {
		if (preloaded.unit && !s.isCreator) s.unit = preloaded.unit
		if (preloaded.topic) s.topic = preloaded.topic
		if (preloaded.prepMode !== undefined) s.prepMode = preloaded.prepMode
		if (preloaded.backlog && preloaded.backlog.length > 0 && s.backlog.length === 0) {
			s.backlog = preloaded.backlog.map((t) => ({ ...t }))
			s.prepMode = preloaded.prepMode ?? true
		}
		if (preloaded.prepDone) s.prepDone = preloaded.prepDone
	}

	s.persistentHistory = s.storage.getVerdictHistory(s.unit)

	deps.saveSession({
		roomId,
		userName: name,
		topic: '',
		unit: selectedUnit ?? s.unit,
		isCreator: s.isCreator,
		peerNames: [],
		lastUsed: Date.now(),
		secretKey: s.isCreator ? keys.secretKeyHex : undefined,
		publicKey: keys.publicKeyHex,
	})

	// Restore from localStorage (only if not already loaded from Nostr)
	const savedBacklog = s.storage.getBacklog()
	if (savedBacklog.length > 0 && s.backlog.length === 0) {
		s.backlog = savedBacklog.map((t) => ({ ...t }))
		s.prepMode = true
	}

	// Load pre-estimates into in-memory map (clone-and-reassign for Svelte reactivity)
	if (s.backlog.length > 0) {
		const savedEstimates = s.storage.getPreEstimates()
		if (savedEstimates.size > 0) {
			const merged = new Map(s.myEstimates)
			for (const [ticketId, est] of savedEstimates) {
				merged.set(ticketId, est)
			}
			s.myEstimates = merged
		}
		selectTicket(s, 0)
	}
}

/**
 * Apply Nostr-queried room state between prepareJoin and connectSession.
 * Handles backlog restoration, unit/topic sync, pre-estimate loading.
 */
export function applyNostrState(
	s: SessionState,
	roomState: RoomState | null,
	prepDone: PrepDoneSignal[],
): void {
	if (roomState && !s.isCreator) {
		if (roomState.creatorName) s.creatorName = roomState.creatorName
		// Restore creator role if this user's name matches the room creator
		if (roomState.creatorName && roomState.creatorName === s.userName) {
			s.isCreator = true
		}
		if (s.backlog.length === 0 && roomState.backlog.length > 0) {
			s.backlog = roomState.backlog.map((t) => ({ ...t }))
			s.prepMode = roomState.prepMode
			if (roomState.unit) s.unit = roomState.unit
			if (roomState.topic) s.topic = roomState.topic
			if (s.storage) {
				const savedEstimates = s.storage.getPreEstimates()
				if (savedEstimates.size > 0) {
					const merged = new Map(s.myEstimates)
					for (const [ticketId, est] of savedEstimates) {
						merged.set(ticketId, est)
					}
					s.myEstimates = merged
				}
			}
			if (s.backlog.length > 0) selectTicket(s, 0)
		}
	}
	if (prepDone.length > 0) s.prepDone = prepDone
}

/** Phase 2: Connect to P2P network (can be called after async Nostr query). */
export function connectSession(s: SessionState, deps: SessionDeps, roomId: string): void {
	const nostrConfig = s.roomCode && s.secretKeyHex
		? { roomCode: s.roomCode, secretKeyHex: s.secretKeyHex }
		: undefined
	s.session = deps.createSession(roomId, createPeerCallbacks(s, deps), nostrConfig)
	// Publish initial room state so creatorName is available to late joiners
	if (s.isCreator) publishState(s, deps)
}

/** Convenience: prepareJoin + connectSession in one call. */
export function joinSession(
	s: SessionState,
	deps: SessionDeps,
	roomId: string,
	name: string,
	selectedUnit: string | null,
	preloaded?: PreloadedState,
): void {
	prepareJoin(s, deps, roomId, name, selectedUnit, preloaded)
	connectSession(s, deps, roomId)
}
