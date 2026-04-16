import type { SessionState } from './session-state'

// ---------------------------------------------------------------------------
// Participant queries (pure functions)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Unit management
// ---------------------------------------------------------------------------

export function changeUnit(s: SessionState, newUnit: string): void {
	if (!s.isCreator) return
	s.unit = newUnit
	s.session?.sendUnit({ unit: newUnit })
	if (s.storage) s.persistentHistory = s.storage.getVerdictHistory(newUnit)
}
