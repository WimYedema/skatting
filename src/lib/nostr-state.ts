/**
 * Nostr event persistence for async room state.
 * - Creator publishes room state as kind-30078 replaceable events
 * - Joiners query state before connecting P2P
 * - Participants publish prep-done signals
 */
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'
import { NOSTR_RELAY_URLS } from './config'
import {
	computeBridgeDTag,
	computeDTag,
	decrypt,
	deriveBridgeKey,
	deriveRoomKey,
	encrypt,
} from './crypto'
import { createEvent, publishEvent, queryEventByType } from './samen/events'
import { type SyncKeys, sessionExpirationTag } from './samen/nostr-config'
import {
	type EstimationRequestPayload,
	EVENT_ESTIMATION_REQUEST,
	EVENT_VERDICTS,
	parseRoomCode,
	sessionEventType,
	type VerdictResultPayload,
} from './samen/types'
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
	creatorName?: string
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
	const [roomKey, dTag] = await Promise.all([deriveRoomKey(roomCode), computeDTag(roomCode)])
	const plaintext = JSON.stringify(state)
	const ciphertext = await encrypt(roomKey, plaintext)
	const sk = hexToBytes(secretKeyHex)

	const event = finalizeEvent(
		{
			kind: KIND_ROOM_STATE,
			created_at: Math.floor(Date.now() / 1000),
			tags: [['d', dTag], sessionExpirationTag()],
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
	const [roomKey, roomDTag] = await Promise.all([deriveRoomKey(roomCode), computeDTag(roomCode)])
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
			tags: [['d', dTag], ['t', 'prep-done'], ['r', roomDTag], sessionExpirationTag()],
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
	const [roomKey, dTag] = await Promise.all([deriveRoomKey(roomCode), computeDTag(roomCode)])

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
	const [roomKey, roomDTag] = await Promise.all([deriveRoomKey(roomCode), computeDTag(roomCode)])

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

// --- Bridge types (Slim ↔ Estimate) ---

/** Estimation request pushed from Slim → Estimate via bridge channel. */
export interface EstimationRequest {
	type: 'estimation-request'
	deliverables: {
		id: string
		title: string
		kind: 'delivery' | 'discovery'
	}[]
	unit: 'days' | 'points'
	boardName?: string
	timestamp: number
}

/** Single verdict entry for bridge publishing. */
export interface BridgeVerdict {
	externalId: string
	title: string
	mu: number
	sigma: number
	n: number
	snappedValue: string
	unit: string
	estimatedAt: number
}

// --- Bridge query ---

/**
 * Query the bridge channel for an estimation request from Slim.
 * Compound room codes query the SamenEvent bus; standalone codes use legacy bridge.
 */
export async function queryEstimationRequest(roomCode: string): Promise<EstimationRequest | null> {
	const { teamCode, sessionCode } = parseRoomCode(roomCode)
	if (teamCode) {
		const eventType = sessionEventType(EVENT_ESTIMATION_REQUEST, sessionCode)
		const event = await queryEventByType(teamCode, eventType)
		if (!event) return null
		const payload = event.payload as EstimationRequestPayload
		if (!Array.isArray(payload?.deliverables)) return null
		return {
			type: 'estimation-request',
			deliverables: payload.deliverables,
			unit: payload.unit,
			boardName: payload.boardName,
			timestamp: event.publishedAt,
		}
	}

	// Legacy bridge for standalone rooms
	const [bridgeKey, dTag] = await Promise.all([
		deriveBridgeKey(roomCode),
		computeBridgeDTag(roomCode, 'request'),
	])

	const pool = new SimplePool()
	try {
		const event = await pool.get(NOSTR_RELAY_URLS, {
			kinds: [KIND_ROOM_STATE],
			'#d': [dTag],
		})
		if (!event) return null

		const plaintext = await decrypt(bridgeKey, event.content)
		const data: unknown = JSON.parse(plaintext)
		if (!isEstimationRequest(data)) return null
		return data
	} catch {
		return null
	} finally {
		pool.close(NOSTR_RELAY_URLS)
	}
}

// --- Bridge publish ---

/**
 * Publish verdict results back to the bridge channel for Slim to consume.
 * Compound room codes route through the SamenEvent bus; standalone codes use legacy bridge.
 */
export async function publishBridgeVerdicts(
	roomCode: string,
	secretKeyHex: string,
	verdicts: BridgeVerdict[],
): Promise<void> {
	const { teamCode, sessionCode } = parseRoomCode(roomCode)
	if (teamCode) {
		const payload: VerdictResultPayload = { verdicts }
		const event = createEvent(
			sessionEventType(EVENT_VERDICTS, sessionCode),
			1,
			payload,
			'anonymous',
		)
		const keys: SyncKeys = {
			secretKeyHex,
			publicKeyHex: getPublicKey(hexToBytes(secretKeyHex)),
		}
		await publishEvent(teamCode, keys, event)
		return
	}

	// Legacy bridge for standalone rooms
	const [bridgeKey, dTag] = await Promise.all([
		deriveBridgeKey(roomCode),
		computeBridgeDTag(roomCode, 'verdicts'),
	])
	const payload = {
		type: 'verdict-result',
		verdicts,
		timestamp: Date.now(),
	}
	const ciphertext = await encrypt(bridgeKey, JSON.stringify(payload))
	const sk = hexToBytes(secretKeyHex)

	const event = finalizeEvent(
		{
			kind: KIND_ROOM_STATE,
			created_at: Math.floor(Date.now() / 1000),
			tags: [['d', dTag], sessionExpirationTag()],
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

// --- Bridge helpers ---

/**
 * Convert an estimation request from Slim into ImportedTickets for the backlog.
 * Maps Slim deliverable IDs into externalId so verdicts can be linked back.
 */
export function estimationRequestToTickets(request: EstimationRequest): ImportedTicket[] {
	return request.deliverables.map((d, i) => ({
		id: `bridge-${i + 1}`,
		title: d.title,
		externalId: d.id,
	}))
}

function isEstimationRequest(v: unknown): v is EstimationRequest {
	if (typeof v !== 'object' || v === null) return false
	const obj = v as Record<string, unknown>
	return (
		obj.type === 'estimation-request' &&
		Array.isArray(obj.deliverables) &&
		typeof obj.unit === 'string' &&
		typeof obj.timestamp === 'number'
	)
}
