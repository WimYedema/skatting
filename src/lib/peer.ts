import type { Room } from '@trystero-p2p/core'
import { selfId } from '@trystero-p2p/core'
import { joinRoom as joinMqttRoom, getRelaySockets as getMqttSockets } from '@trystero-p2p/mqtt'
import { joinRoom as joinNostrRoom, getRelaySockets as getNostrSockets } from '@trystero-p2p/nostr'
import { APP_ID, NOSTR_RELAY_URLS } from './config'
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
	onReveal: (revealed: boolean, reEstimate?: boolean) => void
	onName: (peerId: string, name: string, isCreator: boolean) => void
	onTopic: (topic: string, url?: string, ticketId?: string) => void
	onReady: (peerId: string, ready: boolean, abstained?: boolean) => void
	onUnit: (unit: string) => void
	onBacklog?: (tickets: ImportedTicket[], prepMode?: boolean) => void
	onConnectionError?: (message: string) => void
}

/** Deduplicate callbacks that arrive via multiple strategies within a time window */
function dedup<T>(fn: (data: T) => void, windowMs = 200): (data: T) => void {
	let lastJson = ''
	let lastTime = 0
	return (data: T) => {
		const json = JSON.stringify(data)
		const now = Date.now()
		if (json === lastJson && now - lastTime < windowMs) return
		lastJson = json
		lastTime = now
		fn(data)
	}
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

	// Buffer peer joins during construction — trystero replays existing peers
	// synchronously before createSession returns, so the caller's `session`
	// variable is still null. We replay them after a microtask.
	let ready = false
	const pendingJoins: Array<{ strategy: string; peerId: string }> = []

	function handlePeerJoin(strategy: string, peerId: string) {
		if (!ready) {
			pendingJoins.push({ strategy, peerId })
			return
		}
		processPeerJoin(strategy, peerId)
	}

	function processPeerJoin(strategy: string, peerId: string) {
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
		console.log('[estimate] Nostr strategy initialized')
	} catch (e) {
		console.warn('[estimate] Nostr strategy failed to init:', e)
	}

	try {
		rooms.push(joinMqttRoom({ appId: APP_ID }, roomId))
		console.log('[estimate] MQTT strategy initialized')
	} catch (e) {
		console.warn('[estimate] MQTT strategy failed to init:', e)
	}

	if (rooms.length === 0) {
		callbacks.onConnectionError?.('Unable to initialize any connection strategy.')
	}

	// Monitor relay health — report disconnected relays after a short delay
	let healthTimer: ReturnType<typeof setInterval> | undefined
	if (rooms.length > 0) {
		healthTimer = setInterval(() => {
			const nostrSockets = getNostrSockets()
			const mqttSockets = getMqttSockets()
			const allSockets = { ...nostrSockets, ...mqttSockets }
			const entries = Object.entries(allSockets)
			if (entries.length === 0) return

			const connected = entries.filter(
				([, ws]) => (ws as WebSocket).readyState === WebSocket.OPEN,
			)
			if (connected.length === 0) {
				callbacks.onConnectionError?.(
					'All relays disconnected — retrying…',
				)
			}
		}, 8000)
	}

	// Wire up actions on all rooms
	const estimateSenders: Array<(data: EstimateMessage) => Promise<void>> = []
	const revealSenders: Array<(data: RevealMessage) => Promise<void>> = []
	const nameSenders: Array<(data: NameMessage) => Promise<void>> = []
	const topicSenders: Array<(data: TopicMessage) => Promise<void>> = []
	const readySenders: Array<(data: ReadyMessage) => Promise<void>> = []
	const unitSenders: Array<(data: UnitMessage) => Promise<void>> = []
	const backlogSenders: Array<(data: BacklogMessage) => Promise<void>> = []

	// Deduplicated receivers for messages with side effects —
	// both Nostr and MQTT fire these, so we need to ignore the duplicate.
	const dedupReveal = dedup((data: RevealMessage) =>
		callbacks.onReveal(data.revealed, data.reEstimate),
	)
	const dedupBacklog = dedup((data: BacklogMessage) =>
		callbacks.onBacklog?.(data.tickets, data.prepMode),
	)
	const dedupTopic = dedup((data: TopicMessage) =>
		callbacks.onTopic(data.topic, data.url, data.ticketId),
	)

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
		onReveal((data) => dedupReveal(data))
		onName((data, peerId) => callbacks.onName(peerId, data.name, !!data.isCreator))
		onTopic((data) => dedupTopic(data))
		onReady((data, peerId) => callbacks.onReady(peerId, data.ready, data.abstained))
		onUnit((data) => callbacks.onUnit(data.unit))
		onBacklog((data) => dedupBacklog(data))
	}

	// Flush buffered peer joins after caller has assigned the return value
	queueMicrotask(() => {
		ready = true
		for (const { strategy, peerId } of pendingJoins) {
			processPeerJoin(strategy, peerId)
		}
		pendingJoins.length = 0
	})

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
			if (healthTimer) clearInterval(healthTimer)
			for (const room of rooms) room.leave()
		},
	}
}

export function getPeerColor(peerId: string, allPeerIds: string[]): string {
	const index = allPeerIds.indexOf(peerId)
	if (index < 0) return PEER_COLORS[0]
	return PEER_COLORS[index % PEER_COLORS.length]
}

export { selfId }
