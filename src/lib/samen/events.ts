/**
 * Samen event bus — publish and query typed cross-tool events via Nostr relays.
 * Events use the SamenEvent envelope so tools can subscribe to types they understand
 * without knowing which tool published them.
 */

import { finalizeEvent, SimplePool } from 'nostr-tools'
import { hexToBytes } from 'nostr-tools/utils'
import { computeEventsDTag, decrypt, deriveEventsKey, encrypt } from './crypto'
import { expirationTag, RELAY_URLS, type SyncKeys } from './nostr-config'
import type { SamenEvent } from './types'

const KIND_EVENTS = 30078

/** Build a SamenEvent envelope. */
export function createEvent(
	type: string,
	version: number,
	payload: unknown,
	publishedBy: string,
): SamenEvent {
	return {
		type,
		version,
		payload,
		publishedBy,
		publishedAt: Date.now(),
	}
}

/** Publish a SamenEvent to the team's event bus on Nostr relays. */
export async function publishEvent(
	teamCode: string,
	keys: SyncKeys,
	event: SamenEvent,
): Promise<void> {
	const [eventsKey, dTag] = await Promise.all([
		deriveEventsKey(teamCode),
		computeEventsDTag(teamCode),
	])

	const ciphertext = await encrypt(eventsKey, JSON.stringify(event))
	const sk = hexToBytes(keys.secretKeyHex)

	// Use a unique d-tag per event type so each type is independently replaceable
	const typeDTag = `${dTag}-${event.type}`

	const nostrEvent = finalizeEvent(
		{
			kind: KIND_EVENTS,
			created_at: Math.floor(Date.now() / 1000),
			tags: [['d', typeDTag], expirationTag()],
			content: ciphertext,
		},
		sk,
	)

	const pool = new SimplePool()
	try {
		await Promise.any(pool.publish(RELAY_URLS, nostrEvent))
	} finally {
		pool.close(RELAY_URLS)
	}
}

/** Query all events from the team's event bus. Returns events sorted newest-first. */
export async function queryEvents(teamCode: string): Promise<SamenEvent[]> {
	const [eventsKey, dTag] = await Promise.all([
		deriveEventsKey(teamCode),
		computeEventsDTag(teamCode),
	])

	const pool = new SimplePool()
	try {
		// Query all events with d-tags that start with the base events d-tag
		const nostrEvents = await pool.querySync(RELAY_URLS, {
			kinds: [KIND_EVENTS],
			'#d': [], // We'll filter client-side since Nostr doesn't support prefix queries on d-tags
		})

		const results: SamenEvent[] = []
		for (const ne of nostrEvents) {
			const eventDTag = ne.tags.find((t) => t[0] === 'd')?.[1]
			if (!eventDTag?.startsWith(dTag)) continue

			try {
				const plaintext = await decrypt(eventsKey, ne.content)
				const data: unknown = JSON.parse(plaintext)
				if (isSamenEvent(data)) {
					results.push(data)
				}
			} catch {
				// Decryption failed — wrong key or corrupted event, skip
			}
		}

		return results.sort((a, b) => b.publishedAt - a.publishedAt)
	} finally {
		pool.close(RELAY_URLS)
	}
}

/** Query a single event type from the team's event bus. */
export async function queryEventByType(
	teamCode: string,
	eventType: string,
): Promise<SamenEvent | null> {
	const [eventsKey, dTag] = await Promise.all([
		deriveEventsKey(teamCode),
		computeEventsDTag(teamCode),
	])

	const typeDTag = `${dTag}-${eventType}`

	const pool = new SimplePool()
	try {
		const event = await pool.get(RELAY_URLS, {
			kinds: [KIND_EVENTS],
			'#d': [typeDTag],
		})
		if (!event) return null

		const plaintext = await decrypt(eventsKey, event.content)
		const data: unknown = JSON.parse(plaintext)
		if (!isSamenEvent(data)) return null
		return data
	} catch {
		return null
	} finally {
		pool.close(RELAY_URLS)
	}
}

function isSamenEvent(data: unknown): data is SamenEvent {
	if (typeof data !== 'object' || data === null) return false
	const obj = data as Record<string, unknown>
	return (
		typeof obj.type === 'string' &&
		typeof obj.version === 'number' &&
		typeof obj.publishedBy === 'string' &&
		typeof obj.publishedAt === 'number' &&
		'payload' in obj
	)
}
