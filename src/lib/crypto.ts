/**
 * Room-level cryptography: HKDF key derivation + AES-256-GCM encrypt/decrypt.
 * Uses Web Crypto API only — no extra dependencies.
 */

const HKDF_SALT = 'estimate-p2p-tool'
const HKDF_INFO = 'skatting-room-v1'

/** Derive a 256-bit AES-GCM key from a room code using HKDF-SHA256. */
export async function deriveRoomKey(roomCode: string): Promise<CryptoKey> {
	const encoder = new TextEncoder()
	const ikm = await crypto.subtle.importKey('raw', encoder.encode(roomCode), 'HKDF', false, [
		'deriveKey',
	])
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode(HKDF_SALT),
			info: encoder.encode(HKDF_INFO),
		},
		ikm,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	)
}

/** Compute a d-tag from a room code: first 16 hex chars of SHA-256. */
export async function computeDTag(roomCode: string): Promise<string> {
	const encoder = new TextEncoder()
	const hash = await crypto.subtle.digest('SHA-256', encoder.encode(roomCode))
	const bytes = new Uint8Array(hash)
	return Array.from(bytes.slice(0, 8))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns base64-encoded `iv:ciphertext` (12-byte IV prepended).
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
	const encoder = new TextEncoder()
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		encoder.encode(plaintext),
	)
	// Combine iv + ciphertext into a single buffer
	const combined = new Uint8Array(iv.length + ciphertext.byteLength)
	combined.set(iv)
	combined.set(new Uint8Array(ciphertext), iv.length)
	return uint8ToBase64(combined)
}

/** Decrypt a base64-encoded `iv:ciphertext` produced by `encrypt()`. */
export async function decrypt(key: CryptoKey, encoded: string): Promise<string> {
	const combined = base64ToUint8(encoded)
	const iv = combined.slice(0, 12)
	const ciphertext = combined.slice(12)
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
	return new TextDecoder().decode(plaintext)
}

// --- Base64 helpers (browser-safe, no Node dependency) ---

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
