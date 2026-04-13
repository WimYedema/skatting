import type { Room } from 'trystero/nostr'
import { joinRoom, selfId } from 'trystero/nostr'
import type { EstimateMessage, PeerEstimate, RevealMessage } from './types'
import { PEER_COLORS } from './types'

const APP_ID = 'estimate-p2p-tool'

export interface PeerSession {
	roomId: string
	selfId: string
	room: Room
	sendEstimate: (estimate: EstimateMessage) => Promise<void>
	sendReveal: (reveal: RevealMessage) => Promise<void>
	leave: () => Promise<void>
}

export interface PeerCallbacks {
	onPeerJoin: (peerId: string) => void
	onPeerLeave: (peerId: string) => void
	onEstimate: (estimate: PeerEstimate) => void
	onReveal: (revealed: boolean) => void
}

export function createSession(roomId: string, callbacks: PeerCallbacks): PeerSession {
	const room = joinRoom({ appId: APP_ID }, roomId)

	const [sendEstimate, onEstimate] = room.makeAction<EstimateMessage>('estimate')
	const [sendReveal, onReveal] = room.makeAction<RevealMessage>('reveal')

	room.onPeerJoin((peerId) => {
		callbacks.onPeerJoin(peerId)
	})

	room.onPeerLeave((peerId) => {
		callbacks.onPeerLeave(peerId)
	})

	onEstimate((data, peerId) => {
		callbacks.onEstimate({ peerId, mu: data.mu, sigma: data.sigma })
	})

	onReveal((data) => {
		callbacks.onReveal(data.revealed)
	})

	return {
		roomId,
		selfId,
		room,
		sendEstimate: async (estimate) => {
			await sendEstimate(estimate)
		},
		sendReveal: async (reveal) => {
			await sendReveal(reveal)
		},
		leave: () => room.leave(),
	}
}

export function getPeerColor(peerId: string, allPeerIds: string[]): string {
	const index = allPeerIds.indexOf(peerId)
	return PEER_COLORS[index % PEER_COLORS.length]
}

export function generateRoomId(): string {
	const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
	let id = ''
	for (let i = 0; i < 5; i++) {
		id += chars[Math.floor(Math.random() * chars.length)]
	}
	return id
}

export { selfId }
