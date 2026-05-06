/**
 * Samen cryptography: HKDF key derivation for roster, room index, and event bus encryption.
 * Uses the same Web Crypto API pattern as tool-level crypto,
 * but with distinct salt/info so samen keys are independent from tool keys.
 */

const HKDF_SALT = 'samen-team-tool'

const HKDF_INFO_ROSTER = 'samen-roster-v1'
const HKDF_INFO_ROOMS = 'samen-rooms-v1'
const HKDF_INFO_EVENTS = 'samen-events-v1'

const DTAG_SUFFIX_ROSTER = '-roster'
const DTAG_SUFFIX_ROOMS = '-rooms'
const DTAG_SUFFIX_EVENTS = '-events'

// --- Key derivation ---

/** Derive a 256-bit AES-GCM key from a room code with the given HKDF info. */
async function deriveKey(roomCode: string, info: string): Promise<CryptoKey> {
	const encoder = new TextEncoder()
	const ikm = await crypto.subtle.importKey('raw', encoder.encode(roomCode), 'HKDF', false, [
		'deriveKey',
	])
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode(HKDF_SALT),
			info: encoder.encode(info),
		},
		ikm,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	)
}

/** Compute a d-tag: base hash + suffix. */
async function computeDTag(roomCode: string, suffix: string): Promise<string> {
	const encoder = new TextEncoder()
	const hash = await crypto.subtle.digest('SHA-256', encoder.encode(roomCode))
	const bytes = new Uint8Array(hash)
	const base = Array.from(bytes.slice(0, 8))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
	return base + suffix
}

/** Derive the AES-GCM key for roster encryption. */
export async function deriveRosterKey(roomCode: string): Promise<CryptoKey> {
	return deriveKey(roomCode, HKDF_INFO_ROSTER)
}

/** Derive the AES-GCM key for room index encryption. */
export async function deriveRoomsKey(roomCode: string): Promise<CryptoKey> {
	return deriveKey(roomCode, HKDF_INFO_ROOMS)
}

/** Derive the AES-GCM key for event bus encryption. */
export async function deriveEventsKey(roomCode: string): Promise<CryptoKey> {
	return deriveKey(roomCode, HKDF_INFO_EVENTS)
}

/** Compute the roster d-tag. */
export async function computeRosterDTag(roomCode: string): Promise<string> {
	return computeDTag(roomCode, DTAG_SUFFIX_ROSTER)
}

/** Compute the room index d-tag. */
export async function computeRoomsDTag(roomCode: string): Promise<string> {
	return computeDTag(roomCode, DTAG_SUFFIX_ROOMS)
}

/** Compute the event bus d-tag. */
export async function computeEventsDTag(roomCode: string): Promise<string> {
	return computeDTag(roomCode, DTAG_SUFFIX_EVENTS)
}

// --- Encrypt / decrypt (shared by all channels) ---

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns base64-encoded IV+ciphertext (12-byte IV prepended).
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
	const encoder = new TextEncoder()
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		encoder.encode(plaintext),
	)
	const combined = new Uint8Array(iv.length + ciphertext.byteLength)
	combined.set(iv)
	combined.set(new Uint8Array(ciphertext), iv.length)
	return uint8ToBase64(combined)
}

/** Decrypt a base64-encoded IV+ciphertext produced by encrypt(). */
export async function decrypt(key: CryptoKey, encoded: string): Promise<string> {
	const combined = base64ToUint8(encoded)
	const iv = combined.slice(0, 12)
	const ciphertext = combined.slice(12)
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
	return new TextDecoder().decode(plaintext)
}

function uint8ToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (const b of bytes) binary += String.fromCharCode(b)
	return btoa(binary)
}

function base64ToUint8(str: string): Uint8Array {
	const binary = atob(str)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes
}
