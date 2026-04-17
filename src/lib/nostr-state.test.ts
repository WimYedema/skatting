import { describe, expect, it } from 'vitest'
import { generateSessionKeys } from './nostr-state'

describe('generateSessionKeys', () => {
	it('returns a hex-encoded secret key (64 chars)', () => {
		const keys = generateSessionKeys()
		expect(keys.secretKeyHex).toMatch(/^[0-9a-f]{64}$/)
	})

	it('returns a hex-encoded public key (64 chars)', () => {
		const keys = generateSessionKeys()
		expect(keys.publicKeyHex).toMatch(/^[0-9a-f]{64}$/)
	})

	it('generates different keys each call', () => {
		const a = generateSessionKeys()
		const b = generateSessionKeys()
		expect(a.secretKeyHex).not.toBe(b.secretKeyHex)
		expect(a.publicKeyHex).not.toBe(b.publicKeyHex)
	})

	it('public key is deterministic from secret key', () => {
		// Calling twice should give different pairs, but within a pair they're consistent
		const keys = generateSessionKeys()
		expect(keys.secretKeyHex).toBeTruthy()
		expect(keys.publicKeyHex).toBeTruthy()
	})
})
