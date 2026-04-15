/**
 * Nostr event persistence for async room state.
 * - Creator publishes room state as kind-30078 replaceable events
 * - Joiners query state before connecting P2P
 * - Participants publish prep-done signals
 */
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'
import { NOSTR_RELAY_URLS } from './config'
import { computeDTag, decrypt, deriveRoomKey, encrypt } from './crypto'
import type { ImportedTicket } from './types'

// --- Kind constants ---
const KIND_ROOM_STATE = 30078
const KIND_PREP_DONE = 30079

// --- Types ---

export interface RoomState {
	backlog: ImportedTicket[]
	unit: string
	prepMode: boolean
	topic: string
}

export interface PrepDoneSignal {
	name: string
	ticketCount: number
	timestamp: number
}

export interface NostrSessionKeys {
	secretKeyHex: string
	publicKeyHex: string
}

// --- Key management ---

export function generateSessionKeys(): NostrSessionKeys {
	const sk = generateSecretKey()
	return {
		secretKeyHex: bytesToHex(sk),
		publicKeyHex: getPublicKey(sk),
	}
}

// --- Publication (creator side) ---

/**
 * Publish or update the room state as an encrypted Nostr replaceable event.
 * Uses kind 30078 (application-specific data) with a d-tag derived from room code.
 */
export async function publishRoomState(
	roomCode: string,
	secretKeyHex: string,
	state: RoomState,
): Promise<void> {
	const [roomKey, dTag] = await Promise.all([
		deriveRoomKey(roomCode),
		computeDTag(roomCode),
	])
	const plaintext = JSON.stringify(state)
	const ciphertext = await encrypt(roomKey, plaintext)
	const sk = hexToBytes(secretKeyHex)

	const event = finalizeEvent(
		{
			kind: KIND_ROOM_STATE,
			created_at: Math.floor(Date.now() / 1000),
			tags: [['d', dTag]],
			content: ciphertext,
		},
		sk,
	)

	const pool = new SimplePool()
	try {
		await Promise.any(pool.publish(NOSTR_RELAY_URLS, event))
	} finally {
		pool.close(NOSTR_RELAY_URLS)
	}
}

/**
 * Publish a prep-done signal for this participant.
 * Uses kind 30079 with d-tag = roomHash + pubkey suffix for per-user replacement.
 */
export async function publishPrepDone(
	roomCode: string,
	secretKeyHex: string,
	signal: PrepDoneSignal,
): Promise<void> {
	const [roomKey, roomDTag] = await Promise.all([
		deriveRoomKey(roomCode),
		computeDTag(roomCode),
	])
	const sk = hexToBytes(secretKeyHex)
	const pk = getPublicKey(sk)
	// Per-user d-tag: room hash + first 8 chars of pubkey
	const dTag = `${roomDTag}-${pk.slice(0, 8)}`

	const plaintext = JSON.stringify(signal)
	const ciphertext = await encrypt(roomKey, plaintext)

	const event = finalizeEvent(
		{
			kind: KIND_PREP_DONE,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['d', dTag],
				['t', 'prep-done'],
				['r', roomDTag],
			],
			content: ciphertext,
		},
		sk,
	)

	const pool = new SimplePool()
	try {
		await Promise.any(pool.publish(NOSTR_RELAY_URLS, event))
	} finally {
		pool.close(NOSTR_RELAY_URLS)
	}
}

// --- Query (joiner side) ---

/**
 * Query Nostr relays for the latest room state.
 * Returns null if no state is found (room doesn't exist or hasn't been published).
 */
export async function queryRoomState(roomCode: string): Promise<RoomState | null> {
	const [roomKey, dTag] = await Promise.all([
		deriveRoomKey(roomCode),
		computeDTag(roomCode),
	])

	const pool = new SimplePool()
	try {
		const event = await pool.get(NOSTR_RELAY_URLS, {
			kinds: [KIND_ROOM_STATE],
			'#d': [dTag],
		})

		if (!event) return null

		const plaintext = await decrypt(roomKey, event.content)
		const state: unknown = JSON.parse(plaintext)
		if (!isRoomState(state)) return null
		return state
	} catch {
		return null
	} finally {
		pool.close(NOSTR_RELAY_URLS)
	}
}

/**
 * Query Nostr relays for prep-done signals from participants.
 */
export async function queryPrepDone(roomCode: string): Promise<PrepDoneSignal[]> {
	const [roomKey, roomDTag] = await Promise.all([
		deriveRoomKey(roomCode),
		computeDTag(roomCode),
	])

	const pool = new SimplePool()
	try {
		const events = await pool.querySync(NOSTR_RELAY_URLS, {
			kinds: [KIND_PREP_DONE],
			'#r': [roomDTag],
		})

		const signals: PrepDoneSignal[] = []
		for (const event of events) {
			try {
				const plaintext = await decrypt(roomKey, event.content)
				const signal: unknown = JSON.parse(plaintext)
				if (isPrepDoneSignal(signal)) signals.push(signal)
			} catch {
				// Skip events that fail to decrypt (wrong key, corrupted)
			}
		}
		return signals
	} catch {
		return []
	} finally {
		pool.close(NOSTR_RELAY_URLS)
	}
}

// --- Validation helpers ---

function isRoomState(v: unknown): v is RoomState {
	if (typeof v !== 'object' || v === null) return false
	const obj = v as Record<string, unknown>
	return (
		Array.isArray(obj.backlog) &&
		typeof obj.unit === 'string' &&
		typeof obj.prepMode === 'boolean' &&
		typeof obj.topic === 'string'
	)
}

function isPrepDoneSignal(v: unknown): v is PrepDoneSignal {
	if (typeof v !== 'object' || v === null) return false
	const obj = v as Record<string, unknown>
	return (
		typeof obj.name === 'string' &&
		typeof obj.ticketCount === 'number' &&
		typeof obj.timestamp === 'number'
	)
}
