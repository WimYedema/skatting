import type { NostrSessionKeys, PrepDoneSignal, RoomState } from './nostr-state'
import type { PeerCallbacks, PeerSession } from './peer'
import type { SavedSession, ScopedStorage } from './session-store'
import type { EstimatedTicket, HistoryEntry, ImportedTicket, PeerEstimate, VerdictSnapshot } from './types'

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
	/** Post-reveal conclusion curve position (dragged by mic holder) */
	conclusionMode: number | null
	conclusionSigma: number | null
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
		authoritativeVerdict: null,
		conclusionMode: null,
		conclusionSigma: null,
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
	onConclusion?: (mode: number | null, sigma: number | null, ts: number) => void
}

/** State that can be pre-loaded from Nostr relays before connecting P2P. */
export interface PreloadedState {
	backlog?: ImportedTicket[]
	unit?: string
	prepMode?: boolean
	topic?: string
	prepDone?: PrepDoneSignal[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Stale threshold for mic holder warning (ms).
 * Exported so App.svelte can use the same value for its derived warning.
 */
export const MIC_HOLDER_STALE_MS = 15_000

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

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

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

/** Publish room state to Nostr relays (fire-and-forget). */
export function publishState(s: SessionState, deps: SessionDeps): void {
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
