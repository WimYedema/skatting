/**
 * Shared Nostr configuration — relay URLs, key types, and NIP-40 expiration.
 * Used by both Slim (board sync) and Samen (roster sync) to avoid duplication.
 */

export const RELAY_URLS = ['wss://nos.lol', 'wss://relay.primal.net']

/** NIP-40 expiration: 30 days from now (in seconds). Events are republished
 *  on every update, so 30 days is generous. Compliant relays auto-delete
 *  after this; non-compliant ones still hold only ciphertext. */
export const EXPIRATION_TTL_SECONDS = 30 * 24 * 60 * 60

export function expirationTag(): [string, string] {
	return ['expiration', String(Math.floor(Date.now() / 1000) + EXPIRATION_TTL_SECONDS)]
}

/** Nostr keypair used for signing and encryption */
export interface SyncKeys {
	secretKeyHex: string
	publicKeyHex: string
}
