import { getCurrentTicket, MIC_HOLDER_STALE_MS, type SessionState } from './session-state'
import type { HistoryEntry, PeerEstimate, RevealMessage, VerdictSnapshot } from './types'
import { applyVerdict, computeVerdict, upsertHistory } from './verdict'
import type { VerdictResult } from './verdict'

// ---------------------------------------------------------------------------
// Ready-state reset (shared primitive)
// ---------------------------------------------------------------------------

/** Reset peer-ready state (shared by resetRound, reEstimate, selectTicket, onReveal) */
export function resetReadyState(s: SessionState): void {
	s.revealed = false
	s.selfReady = false
	s.selfAbstained = false
	s.readyPeers = new Set()
	s.abstainedPeers = new Set()
	s.skippedPeers = new Set()
	s.peerEstimateMap = new Map()
}

export function resetRound(s: SessionState): void {
	resetReadyState(s)
	s.mu = 2.0
	s.sigma = 0.6
	s.hasMoved = false
	s.liveAdjust = false
	s.authoritativeVerdict = null
	s.conclusionMode = null
	s.conclusionSigma = null
}

// ---------------------------------------------------------------------------
// Estimation actions
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
	// Auto-abstain: clicking Ready without moving the blob means "no opinion"
	if (!s.hasMoved && !s.selfAbstained) {
		handleAbstain(s)
		return
	}
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

// ---------------------------------------------------------------------------
// Reveal & verdict
// ---------------------------------------------------------------------------

/**
 * Build an authoritative reveal payload including the estimate snapshot and
 * computed verdict from the mic holder's local state. Also sets
 * `s.authoritativeVerdict` so the subsequent `saveRoundToHistory` uses it.
 */
export function buildRevealPayload(s: SessionState, extra?: Partial<RevealMessage>): RevealMessage {
	const peerEsts = Array.from(s.peerEstimateMap.values())
		.filter((pe) => !s.abstainedPeers.has(pe.peerId))

	const selfPeerId = s.session?.selfId ?? '__self__'
	const estimates = [
		...(s.selfAbstained ? [] : [{ peerId: selfPeerId, mu: s.mu, sigma: s.sigma }]),
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

// ---------------------------------------------------------------------------
// Skip / unskip peers
// ---------------------------------------------------------------------------

export function skipPeer(s: SessionState, peerId: string): void {
	s.skippedPeers = new Set(s.skippedPeers).add(peerId)
}

export function unskipPeer(s: SessionState, peerId: string): void {
	const next = new Set(s.skippedPeers)
	next.delete(peerId)
	s.skippedPeers = next
}

// ---------------------------------------------------------------------------
// Auto-reveal & re-estimate
// ---------------------------------------------------------------------------

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
	resetReadyState(s)
	s.session?.sendReveal({ revealed: false, reEstimate: true })
}
