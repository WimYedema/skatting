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

/** NIP-40 expiration for transient sessions: 7 days. Estimation sessions
 *  are short-lived — room state only needs to survive until all peers have joined. */
export const SESSION_EXPIRATION_TTL_SECONDS = 7 * 24 * 60 * 60

export function sessionExpirationTag(): [string, string] {
	return ['expiration', String(Math.floor(Date.now() / 1000) + SESSION_EXPIRATION_TTL_SECONDS)]
}

/** Nostr keypair used for signing and encryption */
export interface SyncKeys {
	secretKeyHex: string
	publicKeyHex: string
}

// --- Relay health ---

export interface RelayHealth {
	url: string
	reachable: boolean
	latencyMs: number | null
}

/** Check relay health by attempting a WebSocket connection to each relay.
 *  Returns per-relay reachability and latency. */
export async function checkRelayHealth(urls: string[] = RELAY_URLS): Promise<RelayHealth[]> {
	return Promise.all(
		urls.map(async (url): Promise<RelayHealth> => {
			const start = Date.now()
			try {
				const ws = new WebSocket(url)
				const ok = await new Promise<boolean>((resolve) => {
					const timer = setTimeout(() => {
						ws.close()
						resolve(false)
					}, 5000)
					ws.onopen = () => {
						clearTimeout(timer)
						ws.close()
						resolve(true)
					}
					ws.onerror = () => {
						clearTimeout(timer)
						resolve(false)
					}
				})
				return { url, reachable: ok, latencyMs: ok ? Date.now() - start : null }
			} catch {
				return { url, reachable: false, latencyMs: null }
			}
		}),
	)
}
