/**
 * Nostr relay message transport — encrypted pub/sub for room actions.
 * Provides a secondary communication channel that works through firewalls
 * (plain WebSocket) when WebRTC data channels are blocked.
 *
 * Uses ephemeral events (kind 25078) so messages are forwarded to subscribers
 * but not stored on relays.
 */
import { finalizeEvent, SimplePool } from 'nostr-tools'
import type { SubCloser } from 'nostr-tools/abstract-pool'
import { hexToBytes } from 'nostr-tools/utils'
import { NOSTR_RELAY_URLS } from './config'
import { computeDTag, decrypt, deriveRoomKey, encrypt } from './crypto'
import { debugLog } from './debug'

const KIND_RELAY = 25078

interface RelayEnvelope {
	action: string
	from: string
	data: unknown
}

export interface NostrRelay {
	send(action: string, data: unknown): Promise<void>
	close(): void
}

/**
 * Create a Nostr relay transport for a room.
 * Messages are encrypted with the room key and published as ephemeral events.
 * Incoming messages from other participants are decrypted and forwarded
 * to `onMessage`. Own messages are filtered out via `selfId`.
 */
export async function createNostrRelay(
	roomCode: string,
	secretKeyHex: string,
	selfId: string,
	onMessage: (action: string, fromId: string, data: unknown) => void,
): Promise<NostrRelay> {
	const [roomKey, roomDTag] = await Promise.all([
		deriveRoomKey(roomCode),
		computeDTag(roomCode),
	])
	const sk = hexToBytes(secretKeyHex)
	const pool = new SimplePool()
	let sub: SubCloser | undefined

	try {
		sub = pool.subscribeMany(
			NOSTR_RELAY_URLS,
			{
				kinds: [KIND_RELAY],
				'#r': [roomDTag],
				since: Math.floor(Date.now() / 1000) - 5,
			},
			{
				onevent(event) {
					decrypt(roomKey, event.content)
						.then((plaintext) => {
							const msg: unknown = JSON.parse(plaintext)
							if (isRelayEnvelope(msg) && msg.from !== selfId) {
								debugLog('nostr-relay', `recv ${msg.action} from ${msg.from}`)
								onMessage(msg.action, msg.from, msg.data)
							}
						})
						.catch(() => {
							/* skip undecryptable / malformed events */
						})
				},
			},
		)
		debugLog('nostr-relay', 'subscription started', { roomDTag })
	} catch (e) {
		debugLog('nostr-relay', 'subscription failed', e)
		pool.close(NOSTR_RELAY_URLS)
		return { async send() {}, close() {} }
	}

	return {
		async send(action: string, data: unknown) {
			const envelope: RelayEnvelope = { action, from: selfId, data }
			const ciphertext = await encrypt(roomKey, JSON.stringify(envelope))

			const event = finalizeEvent(
				{
					kind: KIND_RELAY,
					created_at: Math.floor(Date.now() / 1000),
					tags: [['r', roomDTag]],
					content: ciphertext,
				},
				sk,
			)

			await Promise.allSettled(pool.publish(NOSTR_RELAY_URLS, event))
		},

		close() {
			sub?.close()
			pool.close(NOSTR_RELAY_URLS)
			debugLog('nostr-relay', 'closed')
		},
	}
}

function isRelayEnvelope(v: unknown): v is RelayEnvelope {
	if (typeof v !== 'object' || v === null) return false
	const obj = v as Record<string, unknown>
	return typeof obj.action === 'string' && typeof obj.from === 'string'
}
