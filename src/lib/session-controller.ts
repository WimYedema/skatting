import { MAX_PEERS } from './config'
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
export { getAllParticipants, getActiveParticipants, getReadyCount, getAllReady, hasMic, handOffMic, takeMicBack, claimMic, changeUnit, buildParticipantsData, type ParticipantInfo } from './session-participants'

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
			if (peerId === deps.selfId) return
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
