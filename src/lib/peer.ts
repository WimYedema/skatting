import type { Room } from '@trystero-p2p/core'
import { selfId } from '@trystero-p2p/core'
import { joinRoom as joinMqttRoom, getRelaySockets as getMqttSockets } from '@trystero-p2p/mqtt'
import { joinRoom as joinNostrRoom, getRelaySockets as getNostrSockets } from '@trystero-p2p/nostr'
import { APP_ID, NOSTR_RELAY_URLS } from './config'
import { debugLog } from './debug'
import { createNostrRelay, type NostrRelay } from './nostr-relay'
import type {
	BacklogMessage,
	EstimateMessage,
	ImportedTicket,
	LiveAdjustMessage,
	MicMessage,
	NameMessage,
	PeerEstimate,
	PingMessage,
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
	sendLiveAdjust: (msg: LiveAdjustMessage) => Promise<void>
	sendMic: (msg: MicMessage) => Promise<void>
	sendPing: (msg: PingMessage) => Promise<void>
	leave: () => void
}

export interface PeerCallbacks {
	onPeerJoin: (peerId: string) => void
	onPeerLeave: (peerId: string) => void
	onEstimate: (estimate: PeerEstimate) => void
	onReveal: (msg: RevealMessage) => void
	onName: (peerId: string, name: string, isCreator: boolean) => void
	onTopic: (topic: string, url?: string, ticketId?: string) => void
	onReady: (peerId: string, ready: boolean, abstained?: boolean) => void
	onUnit: (unit: string) => void
	onBacklog?: (tickets: ImportedTicket[], prepMode?: boolean) => void
	onLiveAdjust?: (liveAdjust: boolean) => void
	onMic?: (holder: string | null) => void
	onPing?: (peerId: string, ts: number) => void
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
function broadcastAll<T>(senders: Array<(data: T) => Promise<void>>, action?: string) {
	return async (data: T) => {
		if (action) debugLog('send', action, data)
		await Promise.allSettled(senders.map((s) => s(data)))
	}
}

export function createSession(
	roomId: string,
	callbacks: PeerCallbacks,
	nostrConfig?: { roomCode: string; secretKeyHex: string },
): PeerSession {
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
		debugLog('peer', `join via ${strategy}${isNew ? ' (NEW)' : ' (dup)'}`, peerId)
		if (isNew) callbacks.onPeerJoin(peerId)
	}

	function handlePeerLeave(strategy: string, peerId: string) {
		const strategies = peerStrategies.get(peerId)
		if (!strategies) return
		strategies.delete(strategy)
		debugLog('peer', `leave via ${strategy} (remaining: ${strategies.size})`, peerId)
		if (strategies.size === 0) {
			peerStrategies.delete(peerId)
			callbacks.onPeerLeave(peerId)
		}
	}

	// Join both strategies simultaneously
	const rooms: Room[] = []

	try {
		rooms.push(joinNostrRoom({ appId: APP_ID, relayUrls: NOSTR_RELAY_URLS }, roomId))
		debugLog('peer', 'Nostr strategy initialized', { roomId, relays: NOSTR_RELAY_URLS })
	} catch (e) {
		debugLog('peer', 'Nostr strategy FAILED', e)
		console.warn('[estimate] Nostr strategy failed to init:', e)
	}

	try {
		rooms.push(joinMqttRoom({ appId: APP_ID }, roomId))
		debugLog('peer', 'MQTT strategy initialized', { roomId })
	} catch (e) {
		debugLog('peer', 'MQTT strategy FAILED', e)
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
			const socketEntries = Object.entries(allSockets)
			if (socketEntries.length === 0) return

			const states = socketEntries.map(([url, ws]) => ({
				url,
				state: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][(ws as WebSocket).readyState] ?? 'UNKNOWN',
			}))
			const connected = socketEntries.filter(
				([, ws]) => (ws as WebSocket).readyState === WebSocket.OPEN,
			)
			debugLog('relay', `${connected.length}/${socketEntries.length} open`, states)
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
	const liveAdjustSenders: Array<(data: LiveAdjustMessage) => Promise<void>> = []
	const micSenders: Array<(data: MicMessage) => Promise<void>> = []
	const pingSenders: Array<(data: PingMessage) => Promise<void>> = []

	// Deduplicated receivers for messages with side effects —
	// both Nostr and MQTT fire these, so we need to ignore the duplicate.
	const dedupReveal = dedup((data: RevealMessage) =>
		callbacks.onReveal(data),
	)
	const dedupBacklog = dedup((data: BacklogMessage) =>
		callbacks.onBacklog?.(data.tickets, data.prepMode),
	)
	const dedupTopic = dedup((data: TopicMessage) =>
		callbacks.onTopic(data.topic, data.url, data.ticketId),
	)
	const dedupLiveAdjust = dedup((data: LiveAdjustMessage) =>
		callbacks.onLiveAdjust?.(data.liveAdjust),
	)
	const dedupMic = dedup((data: MicMessage) =>
		callbacks.onMic?.(data.holder),
	)

	// Route incoming Nostr relay messages to the same callbacks as WebRTC.
	// If the sender is unknown, register them as a peer via the relay strategy.
	function routeRelayMessage(action: string, fromId: string, data: unknown) {
		handlePeerJoin('nostr-relay', fromId)
		switch (action) {
			case 'estimate': {
				const d = data as EstimateMessage
				callbacks.onEstimate({ peerId: fromId, mu: d.mu, sigma: d.sigma })
				break
			}
			case 'reveal': dedupReveal(data as RevealMessage); break
			case 'name': {
				const d = data as NameMessage
				callbacks.onName(fromId, d.name, !!d.isCreator)
				break
			}
			case 'topic': dedupTopic(data as TopicMessage); break
			case 'ready': {
				const d = data as ReadyMessage
				callbacks.onReady(fromId, d.ready, d.abstained)
				break
			}
			case 'unit': callbacks.onUnit((data as UnitMessage).unit); break
			case 'backlog': dedupBacklog(data as BacklogMessage); break
			case 'liveadjust': dedupLiveAdjust(data as LiveAdjustMessage); break
			case 'mic': dedupMic(data as MicMessage); break
			case 'ping': callbacks.onPing?.(fromId, (data as PingMessage).ts); break
		}
	}

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
		const [sendLiveAdjust, onLiveAdjust] = room.makeAction<LiveAdjustMessage>('liveadjust')
		const [sendMic, onMic] = room.makeAction<MicMessage>('mic')
		const [sendPing, onPing] = room.makeAction<PingMessage>('ping')

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
		liveAdjustSenders.push(async (d) => {
			await sendLiveAdjust(d)
		})
		micSenders.push(async (d) => {
			await sendMic(d)
		})
		pingSenders.push(async (d) => {
			await sendPing(d)
		})

		// All receivers are idempotent — duplicates just overwrite with same value
		onEstimate((data, peerId) => {
			debugLog('recv', `estimate from ${peerId}`, data)
			callbacks.onEstimate({ peerId, mu: data.mu, sigma: data.sigma })
		})
		onReveal((data) => { debugLog('recv', 'reveal', data); dedupReveal(data) })
		onName((data, peerId) => { debugLog('recv', `name from ${peerId}`, data); callbacks.onName(peerId, data.name, !!data.isCreator) })
		onTopic((data) => { debugLog('recv', 'topic', data); dedupTopic(data) })
		onReady((data, peerId) => { debugLog('recv', `ready from ${peerId}`, data); callbacks.onReady(peerId, data.ready, data.abstained) })
		onUnit((data) => { debugLog('recv', 'unit', data); callbacks.onUnit(data.unit) })
		onBacklog((data) => { debugLog('recv', 'backlog', { count: data.tickets.length, prepMode: data.prepMode }); dedupBacklog(data) })
		onLiveAdjust((data) => { debugLog('recv', 'liveAdjust', data); dedupLiveAdjust(data) })
		onMic((data) => { debugLog('recv', 'mic', data); dedupMic(data) })
		onPing((data, peerId) => { callbacks.onPing?.(peerId, data.ts) })
	}

	// Nostr relay transport — secondary channel for firewall resilience.
	// Sends all actions (except ping) through Nostr events in parallel with WebRTC.
	// Initialized async; senders no-op until the relay is ready.
	let nostrRelay: NostrRelay | undefined
	if (nostrConfig) {
		// Push senders that route through relay once ready (closures see updated variable)
		estimateSenders.push(async (d) => { await nostrRelay?.send('estimate', d) })
		revealSenders.push(async (d) => { await nostrRelay?.send('reveal', d) })
		nameSenders.push(async (d) => { await nostrRelay?.send('name', d) })
		topicSenders.push(async (d) => { await nostrRelay?.send('topic', d) })
		readySenders.push(async (d) => { await nostrRelay?.send('ready', d) })
		unitSenders.push(async (d) => { await nostrRelay?.send('unit', d) })
		backlogSenders.push(async (d) => { await nostrRelay?.send('backlog', d) })
		liveAdjustSenders.push(async (d) => { await nostrRelay?.send('liveadjust', d) })
		micSenders.push(async (d) => { await nostrRelay?.send('mic', d) })
		// Ping IS relayed so relay-only peers get liveness tracking and peer
		// discovery, but at a slower cadence (15s) to stay within rate limits.
		// The relay ping sender is kept separate from pingSenders so the
		// 5s WebRTC heartbeat doesn't flood the relay.

		createNostrRelay(
			nostrConfig.roomCode,
			nostrConfig.secretKeyHex,
			selfId,
			routeRelayMessage,
		).then((r) => {
			nostrRelay = r
			debugLog('nostr-relay', 'transport ready')
		}).catch((e) => {
			debugLog('nostr-relay', 'transport init failed', e)
		})
	}

	// Flush buffered peer joins after caller has assigned the return value
	queueMicrotask(() => {
		ready = true
		for (const { strategy, peerId } of pendingJoins) {
			processPeerJoin(strategy, peerId)
		}
		pendingJoins.length = 0
	})

	const broadcastPing = broadcastAll(pingSenders)

	// Heartbeat: send ping every 5s via WebRTC data channels
	const heartbeatTimer = setInterval(() => {
		broadcastPing({ ts: Date.now() })
	}, 5000)

	// Slower relay heartbeat (15s) — keeps relay-only peers discovered and alive
	let relayHeartbeatTimer: ReturnType<typeof setInterval> | undefined
	if (nostrConfig) {
		relayHeartbeatTimer = setInterval(() => {
			nostrRelay?.send('ping', { ts: Date.now() } satisfies PingMessage).catch(() => {})
		}, 15_000)
	}

	return {
		roomId,
		selfId,
		sendEstimate: broadcastAll(estimateSenders, 'estimate'),
		sendReveal: broadcastAll(revealSenders, 'reveal'),
		sendName: broadcastAll(nameSenders, 'name'),
		sendTopic: broadcastAll(topicSenders, 'topic'),
		sendReady: broadcastAll(readySenders, 'ready'),
		sendUnit: broadcastAll(unitSenders, 'unit'),
		sendBacklog: broadcastAll(backlogSenders, 'backlog'),
		sendLiveAdjust: broadcastAll(liveAdjustSenders, 'liveAdjust'),
		sendMic: broadcastAll(micSenders, 'mic'),
		sendPing: broadcastPing,
		leave() {
			if (healthTimer) clearInterval(healthTimer)
			clearInterval(heartbeatTimer)
			if (relayHeartbeatTimer) clearInterval(relayHeartbeatTimer)
			for (const room of rooms) room.leave()
			nostrRelay?.close()
		},
	}
}

export function getPeerColor(peerId: string, allPeerIds: string[]): string {
	const index = allPeerIds.indexOf(peerId)
	if (index < 0) return PEER_COLORS[0]
	return PEER_COLORS[index % PEER_COLORS.length]
}

export { selfId }
