import { MAX_PEERS } from './config'
import { debugLog } from './debug'
import type { PrepDoneSignal, RoomState } from './nostr-state'
import type { PeerCallbacks } from './peer'
import type { ImportedTicket, PeerEstimate, RevealMessage } from './types'
import { getCurrentTicket, persistSession, publishState, type SessionDeps, type SessionState, type PreloadedState } from './session-state'
import { resetReadyState, resetRound, saveRoundToHistory } from './session-round'
import { selectTicket } from './session-backlog'

// ---------------------------------------------------------------------------
// Facade re-exports — components import only from session-controller.ts
// ---------------------------------------------------------------------------

export { type SessionState, type SessionDeps, type PreloadedState, createInitialState, getCurrentTicket, getEstimatedCount, persistSession, MIC_HOLDER_STALE_MS } from './session-state'
export { resetReadyState, resetRound, saveRoundToHistory, addOrUpdateHistory, handleEstimateChange, handleDone, handleAbstain, handleForceReveal, checkAutoReveal, reEstimate, skipPeer, unskipPeer, toggleLiveAdjust } from './session-round'
export { selectTicket, handleNext, processBacklogImport, mergeBacklogImport, handleReorder, handleRemove, startMeeting, returnToPrep, handleTopicChange } from './session-backlog'
export { getAllParticipants, getActiveParticipants, getReadyCount, getAllReady, hasMic, handOffMic, takeMicBack, claimMic, claimCreator, changeUnit, buildParticipantsData, type ParticipantInfo } from './session-participants'

// ---------------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------------

function assertNoSelfInMap(map: Map<string, PeerEstimate>, selfId: string, context: string): void {
	if (import.meta.env.DEV && map.has(selfId)) {
		console.error(`[BUG] peerEstimateMap contains selfId in ${context}`)
	}
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

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
	s.claimedCreator = false
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
	s.sessionStartedAt = 0
}

// ---------------------------------------------------------------------------
// P2P callback factory
// ---------------------------------------------------------------------------

/** Mark a peer as recently seen (clone-and-reassign for Svelte reactivity) */
function touchPeer(s: SessionState, peerId: string): void {
	s.peerLastSeen = new Map(s.peerLastSeen).set(peerId, Date.now())
}

export function createPeerCallbacks(s: SessionState, deps: SessionDeps): PeerCallbacks {
	// Debounce name-conflict detection: ghost peers that join and vanish
	// within a few seconds shouldn't bounce the user.
	let nameConflictTimer: ReturnType<typeof setTimeout> | undefined
	let nameConflictPeerId: string | undefined

	// Track nameless-peer timers for ghost cleanup
	const namelessNudgeTimers = new Map<string, ReturnType<typeof setTimeout>>()
	const namelessEvictTimers = new Map<string, ReturnType<typeof setTimeout>>()

	function clearNamelessTimers(peerId: string) {
		const n = namelessNudgeTimers.get(peerId)
		if (n) { clearTimeout(n); namelessNudgeTimers.delete(peerId) }
		const e = namelessEvictTimers.get(peerId)
		if (e) { clearTimeout(e); namelessEvictTimers.delete(peerId) }
	}

	return {
		onPeerJoin(peerId: string) {
			if (peerId === deps.selfId) return
			if (s.peerIds.length >= MAX_PEERS) {
				// Room is full — don't track this peer
				return
			}
			s.peerIds = [...s.peerIds, peerId]
			touchPeer(s, peerId)
			// Two-phase ghost cleanup for peers that never send a name:
			// 1. After 5s: re-send our own name as a nudge (prompts real peers to respond)
			// 2. After 10s: evict (they're a ghost)
			// Both timers are cancelled once onName fires for this peer.
			clearNamelessTimers(peerId)
			namelessNudgeTimers.set(peerId, setTimeout(() => {
				namelessNudgeTimers.delete(peerId)
				if (s.peerIds.includes(peerId) && !s.peerNames.has(peerId)) {
					debugLog('peer', 'nudging nameless peer (re-sending name)', peerId)
					s.session?.sendName({ name: s.userName, isCreator: s.isCreator })
				}
			}, 5_000))
			namelessEvictTimers.set(peerId, setTimeout(() => {
				namelessEvictTimers.delete(peerId)
				if (s.peerIds.includes(peerId) && !s.peerNames.has(peerId)) {
					debugLog('peer', 'evicting nameless ghost peer', peerId)
					s.peerIds = s.peerIds.filter((id) => id !== peerId)
				}
			}, 10_000))
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
			// Cancel pending name conflict if the ghost peer left
			if (nameConflictPeerId === peerId) {
				clearTimeout(nameConflictTimer)
				nameConflictTimer = undefined
				nameConflictPeerId = undefined
			}
			// Cancel nameless-peer timers
			clearNamelessTimers(peerId)
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
			if (estimate.peerId === deps.selfId) return
			touchPeer(s, estimate.peerId)
			s.peerEstimateMap = new Map(s.peerEstimateMap).set(estimate.peerId, estimate)
			assertNoSelfInMap(s.peerEstimateMap, deps.selfId, 'onEstimate')
		},
		onReveal(msg: RevealMessage) {
			s.revealed = msg.revealed
			if (msg.revealed && msg.estimates) {
				// Apply authoritative estimate snapshot from the mic holder
				const next = new Map<string, PeerEstimate>()
				for (const e of msg.estimates) {
					if (e.peerId !== deps.selfId) {
						next.set(e.peerId, { peerId: e.peerId, mu: e.mu, sigma: e.sigma })
					}
				}
				s.peerEstimateMap = next
				assertNoSelfInMap(s.peerEstimateMap, deps.selfId, 'onReveal')
				s.authoritativeVerdict = msg.verdict ?? null
			} else if (!msg.revealed && msg.reEstimate) {
				// Re-estimate: reset ready state but keep positions
				resetReadyState(s)
			} else if (!msg.revealed) {
				// Advance to next ticket — apply authoritative verdict from mic holder
				s.authoritativeVerdict = msg.verdict ?? null
				saveRoundToHistory(s)
				resetRound(s)
			}
		},
		onName(peerId: string, name: string, peerIsCreator: boolean) {
			touchPeer(s, peerId)
			// Cancel nameless-peer timers — this peer identified themselves
			clearNamelessTimers(peerId)
			s.peerNames = new Map(s.peerNames).set(peerId, name)
			if (peerIsCreator) {
				s.creatorPeerId = peerId
				s.creatorName = name
				// Yield claimed creator role when the original creator returns
				if (s.isCreator && s.claimedCreator) {
					s.isCreator = false
					s.claimedCreator = false
					s.session?.sendName({ name: s.userName, isCreator: false })
				}
			} else if (s.creatorPeerId === peerId) {
				// Peer yielded creator role — clear them as creator
				s.creatorPeerId = null
			}
			persistSession(s, deps)
			// Bounce if another peer is using our name and we're the one who should yield.
			// Only newcomers (joined < 10s ago) can be bounced — established peers stay.
			// Debounced: ghost peers that join and vanish within 3s are ignored.
			if (name.toLowerCase() === s.userName.toLowerCase()) {
				const recentJoin = Date.now() - s.sessionStartedAt < 10_000
				const theyWin = peerIsCreator && !s.isCreator
				const tiebreak = peerIsCreator === s.isCreator && deps.selfId > peerId
				if (recentJoin && (theyWin || tiebreak)) {
					if (nameConflictTimer) clearTimeout(nameConflictTimer)
					nameConflictPeerId = peerId
					nameConflictTimer = setTimeout(() => {
						nameConflictTimer = undefined
						nameConflictPeerId = undefined
						// Re-check: peer still present and still using our name
						if (s.peerIds.includes(peerId) && s.peerNames.get(peerId)?.toLowerCase() === s.userName.toLowerCase()) {
							deps.onNameConflict?.(name)
						}
					}, 3000)
				}
			}
		},
		onTopic(newTopic: string, url?: string, ticketId?: string) {
			if (ticketId && s.backlog.length > 0) {
				const idx = s.backlog.findIndex((t) => t.id === ticketId)
				if (idx >= 0 && idx !== s.backlogIndex) selectTicket(s, idx, { skipSave: true, skipSend: true })
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
				selectTicket(s, 0, { skipSend: true })
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
		onConclusion(mode: number | null, sigma: number | null, ts: number) {
			deps.onConclusion?.(mode, sigma, ts)
		},
	}
}

// ---------------------------------------------------------------------------
// Session join / create
// ---------------------------------------------------------------------------

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
	// Clean up any existing session so the old Trystero rooms are properly left.
	// Without this, peers may not see a leave→join cycle and won't re-send their name.
	if (s.session) {
		s.session.leave()
		s.session = null
	}
	const nostrConfig = s.roomCode && s.secretKeyHex
		? {
			roomCode: s.roomCode,
			secretKeyHex: s.secretKeyHex,
			getIdentity: () => ({ name: s.userName, isCreator: s.isCreator }),
		}
		: undefined
	s.session = deps.createSession(roomId, createPeerCallbacks(s, deps), nostrConfig)
	s.sessionStartedAt = Date.now()
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
