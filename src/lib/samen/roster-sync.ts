/**
 * Samen roster Nostr sync — publish and query team rosters via Nostr relays.
 * Uses kind 30078 (parameterized replaceable events) with a roster-specific d-tag.
 * All content is AES-256-GCM encrypted with a key derived from the room code
 * using samen-specific HKDF parameters.
 */

import { finalizeEvent, SimplePool } from 'nostr-tools'
import { hexToBytes } from 'nostr-tools/utils'
import { computeRosterDTag, decrypt, deriveRosterKey, encrypt } from './crypto'
import { expirationTag, RELAY_URLS, type SyncKeys } from './nostr-config'
import type { TeamSpace } from './types'

// --- Config ---

const KIND_ROSTER = 30078

/** Roster payload stored in Nostr event content (encrypted). */
interface RosterPayload {
	name: string
	members: TeamSpace['members']
	rooms: TeamSpace['rooms']
	createdAt: number
	updatedAt: number
}

/** Publish (or update) a team roster to Nostr relays. */
export async function publishRoster(
	roomCode: string,
	keys: SyncKeys,
	team: TeamSpace,
): Promise<void> {
	const [rosterKey, dTag] = await Promise.all([
		deriveRosterKey(roomCode),
		computeRosterDTag(roomCode),
	])

	const payload: RosterPayload = {
		name: team.name,
		members: team.members,
		rooms: team.rooms,
		createdAt: team.createdAt,
		updatedAt: team.updatedAt,
	}

	const ciphertext = await encrypt(rosterKey, JSON.stringify(payload))
	const sk = hexToBytes(keys.secretKeyHex)

	const event = finalizeEvent(
		{
			kind: KIND_ROSTER,
			created_at: Math.floor(Date.now() / 1000),
			tags: [['d', dTag], expirationTag()],
			content: ciphertext,
		},
		sk,
	)

	const pool = new SimplePool()
	try {
		await Promise.any(pool.publish(RELAY_URLS, event))
	} finally {
		pool.close(RELAY_URLS)
	}
}

/** Query the latest team roster from Nostr relays. Returns null if not found. */
export async function queryRoster(roomCode: string): Promise<TeamSpace | null> {
	const [rosterKey, dTag] = await Promise.all([
		deriveRosterKey(roomCode),
		computeRosterDTag(roomCode),
	])

	const pool = new SimplePool()
	try {
		const event = await pool.get(RELAY_URLS, {
			kinds: [KIND_ROSTER],
			'#d': [dTag],
		})
		if (!event) return null

		const plaintext = await decrypt(rosterKey, event.content)
		const data: unknown = JSON.parse(plaintext)
		if (!isRosterPayload(data)) return null

		const payload = data as RosterPayload
		return {
			roomCode,
			name: payload.name,
			members: payload.members,
			rooms: payload.rooms ?? [],
			createdAt: payload.createdAt,
			updatedAt: payload.updatedAt,
		}
	} catch {
		return null
	} finally {
		pool.close(RELAY_URLS)
	}
}

function isRosterPayload(data: unknown): data is RosterPayload {
	if (typeof data !== 'object' || data === null) return false
	const obj = data as Record<string, unknown>
	return (
		typeof obj.name === 'string' &&
		Array.isArray(obj.members) &&
		typeof obj.createdAt === 'number' &&
		typeof obj.updatedAt === 'number'
	)
}
