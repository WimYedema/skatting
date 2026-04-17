import { getPeerColor } from './peer'
import type { SessionState } from './session-state'

// ---------------------------------------------------------------------------
// ParticipantInfo — shared shape used by ParticipantsList
// ---------------------------------------------------------------------------

export interface ParticipantInfo {
	id: string
	name: string
	color: string
	isReady: boolean
	isSkipped: boolean
	isAbstained: boolean
	hasMic: boolean
	isLeader: boolean
	isSelf: boolean
	isOffline: boolean
	isStale: boolean
}

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

// ---------------------------------------------------------------------------
// Build participants data for the UI
// ---------------------------------------------------------------------------

export function buildParticipantsData(
	s: SessionState,
	selfId: string,
	holdsMic: boolean,
	staleThreshold: number,
	now: number,
): ParticipantInfo[] {
	const self: ParticipantInfo = {
		id: selfId,
		name: s.userName,
		color: '',
		isReady: s.selfReady,
		isSkipped: false,
		isAbstained: s.selfAbstained,
		hasMic: holdsMic,
		isLeader: s.isCreator,
		isSelf: true,
		isOffline: false,
		isStale: false,
	}

	const peers: ParticipantInfo[] = s.peerIds.map((peerId) => {
		const lastSeen = s.peerLastSeen.get(peerId)
		const isStale = lastSeen != null && now - lastSeen > staleThreshold
		return {
			id: peerId,
			name: s.peerNames.get(peerId) ?? 'Connecting…',
			color: getPeerColor(peerId, s.peerIds),
			isReady: s.readyPeers.has(peerId),
			isSkipped: s.skippedPeers.has(peerId),
			isAbstained: s.abstainedPeers.has(peerId),
			hasMic: s.micHolder === peerId,
			isLeader: peerId === s.creatorPeerId,
			isSelf: false,
			isOffline: false,
			isStale,
		}
	})

	const creatorOffline =
		!s.isCreator && s.creatorName && !s.creatorPeerId && s.creatorName !== s.userName
	if (creatorOffline) {
		peers.push({
			id: '__creator__',
			name: s.creatorName,
			color: '',
			isReady: false,
			isSkipped: false,
			isAbstained: false,
			hasMic: false,
			isLeader: true,
			isSelf: false,
			isOffline: true,
			isStale: false,
		})
	}

	return [self, ...peers]
}
