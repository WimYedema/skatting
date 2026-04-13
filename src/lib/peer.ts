import type { Room } from 'trystero/nostr'
import { joinRoom, selfId } from 'trystero/nostr'
import type {
	EstimateMessage,
	NameMessage,
	PeerEstimate,
	ReadyMessage,
	RevealMessage,
	TopicMessage,
} from './types'
import { PEER_COLORS } from './types'

const APP_ID = 'estimate-p2p-tool'

export interface PeerSession {
	roomId: string
	selfId: string
	room: Room
	sendEstimate: (estimate: EstimateMessage) => Promise<void>
	sendReveal: (reveal: RevealMessage) => Promise<void>
	sendName: (name: NameMessage) => Promise<void>
	sendTopic: (topic: TopicMessage) => Promise<void>
	sendReady: (ready: ReadyMessage) => Promise<void>
	leave: () => Promise<void>
}

export interface PeerCallbacks {
	onPeerJoin: (peerId: string) => void
	onPeerLeave: (peerId: string) => void
	onEstimate: (estimate: PeerEstimate) => void
	onReveal: (revealed: boolean) => void
	onName: (peerId: string, name: string) => void
	onTopic: (topic: string) => void
	onReady: (peerId: string, ready: boolean) => void
}

export function createSession(roomId: string, callbacks: PeerCallbacks): PeerSession {
	const room = joinRoom({ appId: APP_ID }, roomId)

	const [sendEstimate, onEstimate] = room.makeAction<EstimateMessage>('estimate')
	const [sendReveal, onReveal] = room.makeAction<RevealMessage>('reveal')
	const [sendName, onName] = room.makeAction<NameMessage>('name')
	const [sendTopic, onTopic] = room.makeAction<TopicMessage>('topic')
	const [sendReady, onReady] = room.makeAction<ReadyMessage>('ready')

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

	onName((data, peerId) => {
		callbacks.onName(peerId, data.name)
	})

	onTopic((data) => {
		callbacks.onTopic(data.topic)
	})

	onReady((data, peerId) => {
		callbacks.onReady(peerId, data.ready)
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
		sendName: async (name) => {
			await sendName(name)
		},
		sendTopic: async (topic) => {
			await sendTopic(topic)
		},
		sendReady: async (ready) => {
			await sendReady(ready)
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
