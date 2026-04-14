import type { Room } from '@trystero-p2p/core'
import { selfId } from '@trystero-p2p/core'
import { joinRoom as joinMqttRoom } from '@trystero-p2p/mqtt'
import { joinRoom as joinNostrRoom } from '@trystero-p2p/nostr'
import type {
	BacklogMessage,
	EstimateMessage,
	ImportedTicket,
	NameMessage,
	PeerEstimate,
	ReadyMessage,
	RevealMessage,
	TopicMessage,
	UnitMessage,
} from './types'
import { PEER_COLORS } from './types'

const APP_ID = 'estimate-p2p-tool'

const NOSTR_RELAY_URLS = [
	'wss://relay.damus.io',
	'wss://nos.lol',
	'wss://purplerelay.com',
	'wss://relay.nostr.band',
	'wss://relay.snort.social',
]

export interface PeerSession {
	roomId: string
	selfId: string
	sendEstimate: (estimate: EstimateMessage) => Promise<void>
	sendReveal: (reveal: RevealMessage) => Promise<void>
	sendName: (name: NameMessage) => Promise<void>
	sendTopic: (topic: TopicMessage) => Promise<void>
	sendReady: (ready: ReadyMessage) => Promise<void>
	sendUnit: (unit: UnitMessage) => Promise<void>
	sendBacklog: (backlog: BacklogMessage) => Promise<void>
	leave: () => void
}

export interface PeerCallbacks {
	onPeerJoin: (peerId: string) => void
	onPeerLeave: (peerId: string) => void
	onEstimate: (estimate: PeerEstimate) => void
	onReveal: (revealed: boolean) => void
	onName: (peerId: string, name: string) => void
	onTopic: (topic: string, url?: string, ticketId?: string) => void
	onReady: (peerId: string, ready: boolean) => void
	onUnit: (unit: string) => void
	onBacklog?: (tickets: ImportedTicket[]) => void
	onConnectionError?: (message: string) => void
}

/** Send on all rooms, ignoring individual failures */
function broadcastAll<T>(senders: Array<(data: T) => Promise<void>>) {
	return async (data: T) => {
		await Promise.allSettled(senders.map((s) => s(data)))
	}
}

export function createSession(roomId: string, callbacks: PeerCallbacks): PeerSession {
	// Track which strategies each peer is connected through
	const peerStrategies = new Map<string, Set<string>>()

	function handlePeerJoin(strategy: string, peerId: string) {
		let strategies = peerStrategies.get(peerId)
		if (!strategies) {
			strategies = new Set()
			peerStrategies.set(peerId, strategies)
		}
		const isNew = strategies.size === 0
		strategies.add(strategy)
		if (isNew) callbacks.onPeerJoin(peerId)
	}

	function handlePeerLeave(strategy: string, peerId: string) {
		const strategies = peerStrategies.get(peerId)
		if (!strategies) return
		strategies.delete(strategy)
		if (strategies.size === 0) {
			peerStrategies.delete(peerId)
			callbacks.onPeerLeave(peerId)
		}
	}

	// Join both strategies simultaneously
	const rooms: Room[] = []

	try {
		rooms.push(joinNostrRoom({ appId: APP_ID, relayUrls: NOSTR_RELAY_URLS }, roomId))
	} catch {
		/* nostr unavailable */
	}

	try {
		rooms.push(joinMqttRoom({ appId: APP_ID }, roomId))
	} catch {
		/* mqtt unavailable */
	}

	if (rooms.length === 0) {
		callbacks.onConnectionError?.('Unable to initialize any connection strategy.')
	}

	// Wire up actions on all rooms
	const estimateSenders: Array<(data: EstimateMessage) => Promise<void>> = []
	const revealSenders: Array<(data: RevealMessage) => Promise<void>> = []
	const nameSenders: Array<(data: NameMessage) => Promise<void>> = []
	const topicSenders: Array<(data: TopicMessage) => Promise<void>> = []
	const readySenders: Array<(data: ReadyMessage) => Promise<void>> = []
	const unitSenders: Array<(data: UnitMessage) => Promise<void>> = []
	const backlogSenders: Array<(data: BacklogMessage) => Promise<void>> = []

	for (let i = 0; i < rooms.length; i++) {
		const room = rooms[i]
		const strategy = i === 0 && rooms.length > 1 ? 'nostr' : i === 0 ? 'primary' : 'mqtt'

		room.onPeerJoin((peerId) => handlePeerJoin(strategy, peerId))
		room.onPeerLeave((peerId) => handlePeerLeave(strategy, peerId))

		const [sendEstimate, onEstimate] = room.makeAction<EstimateMessage>('estimate')
		const [sendReveal, onReveal] = room.makeAction<RevealMessage>('reveal')
		const [sendName, onName] = room.makeAction<NameMessage>('name')
		const [sendTopic, onTopic] = room.makeAction<TopicMessage>('topic')
		const [sendReady, onReady] = room.makeAction<ReadyMessage>('ready')
		const [sendUnit, onUnit] = room.makeAction<UnitMessage>('unit')
		const [sendBacklog, onBacklog] = room.makeAction<BacklogMessage>('backlog')

		estimateSenders.push(async (d) => {
			await sendEstimate(d)
		})
		revealSenders.push(async (d) => {
			await sendReveal(d)
		})
		nameSenders.push(async (d) => {
			await sendName(d)
		})
		topicSenders.push(async (d) => {
			await sendTopic(d)
		})
		readySenders.push(async (d) => {
			await sendReady(d)
		})
		unitSenders.push(async (d) => {
			await sendUnit(d)
		})
		backlogSenders.push(async (d) => {
			await sendBacklog(d)
		})

		// All receivers are idempotent — duplicates just overwrite with same value
		onEstimate((data, peerId) => {
			callbacks.onEstimate({ peerId, mu: data.mu, sigma: data.sigma })
		})
		onReveal((data) => callbacks.onReveal(data.revealed))
		onName((data, peerId) => callbacks.onName(peerId, data.name))
		onTopic((data) => callbacks.onTopic(data.topic, data.url, data.ticketId))
		onReady((data, peerId) => callbacks.onReady(peerId, data.ready))
		onUnit((data) => callbacks.onUnit(data.unit))
		onBacklog((data) => callbacks.onBacklog?.(data.tickets))
	}

	return {
		roomId,
		selfId,
		sendEstimate: broadcastAll(estimateSenders),
		sendReveal: broadcastAll(revealSenders),
		sendName: broadcastAll(nameSenders),
		sendTopic: broadcastAll(topicSenders),
		sendReady: broadcastAll(readySenders),
		sendUnit: broadcastAll(unitSenders),
		sendBacklog: broadcastAll(backlogSenders),
		leave() {
			for (const room of rooms) room.leave()
		},
	}
}

export function getPeerColor(peerId: string, allPeerIds: string[]): string {
	const index = allPeerIds.indexOf(peerId)
	if (index < 0) return PEER_COLORS[0]
	return PEER_COLORS[index % PEER_COLORS.length]
}

export function generateRoomId(): string {
	const consonants = 'bdfghjkmnprstvz'
	const vowels = 'aeiou'
	let id = ''
	for (let i = 0; i < 3; i++) {
		id += consonants[Math.floor(Math.random() * consonants.length)]
		id += vowels[Math.floor(Math.random() * vowels.length)]
	}
	return id
}

export { selfId }
