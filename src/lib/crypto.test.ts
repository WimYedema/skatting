import { describe, expect, it } from 'vitest'
import { computeDTag, decrypt, deriveRoomKey, encrypt } from './crypto'

describe('deriveRoomKey', () => {
	it('returns an AES-GCM CryptoKey', async () => {
		const key = await deriveRoomKey('bakitume')
		expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
		expect(key.usages).toContain('encrypt')
		expect(key.usages).toContain('decrypt')
	})

	it('is deterministic — same room code gives same key', async () => {
		const key1 = await deriveRoomKey('bakitume')
		const key2 = await deriveRoomKey('bakitume')
		// Can't compare CryptoKey directly, but both should decrypt each other's output
		const ct = await encrypt(key1, 'test')
		const pt = await decrypt(key2, ct)
		expect(pt).toBe('test')
	})

	it('different room codes give different keys', async () => {
		const key1 = await deriveRoomKey('bakitume')
		const key2 = await deriveRoomKey('defopahi')
		const ct = await encrypt(key1, 'secret')
		// Decrypting with wrong key should throw
		await expect(decrypt(key2, ct)).rejects.toThrow()
	})
})

describe('computeDTag', () => {
	it('returns a 16-char hex string', async () => {
		const tag = await computeDTag('bakitume')
		expect(tag).toMatch(/^[0-9a-f]{16}$/)
	})

	it('is deterministic', async () => {
		const a = await computeDTag('bakitume')
		const b = await computeDTag('bakitume')
		expect(a).toBe(b)
	})

	it('different room codes give different tags', async () => {
		const a = await computeDTag('bakitume')
		const b = await computeDTag('defopahi')
		expect(a).not.toBe(b)
	})
})

describe('encrypt / decrypt', () => {
	it('round-trips a string', async () => {
		const key = await deriveRoomKey('testroom')
		const plaintext = 'hello, world!'
		const ct = await encrypt(key, plaintext)
		const result = await decrypt(key, ct)
		expect(result).toBe(plaintext)
	})

	it('ciphertext is base64-encoded', async () => {
		const key = await deriveRoomKey('testroom')
		const ct = await encrypt(key, 'data')
		// Base64 pattern
		expect(ct).toMatch(/^[A-Za-z0-9+/]+=*$/)
	})

	it('different encryptions of same plaintext differ (random IV)', async () => {
		const key = await deriveRoomKey('testroom')
		const ct1 = await encrypt(key, 'same')
		const ct2 = await encrypt(key, 'same')
		expect(ct1).not.toBe(ct2)
		// Both decrypt to the same value
		expect(await decrypt(key, ct1)).toBe('same')
		expect(await decrypt(key, ct2)).toBe('same')
	})

	it('handles empty string', async () => {
		const key = await deriveRoomKey('testroom')
		const ct = await encrypt(key, '')
		expect(await decrypt(key, ct)).toBe('')
	})

	it('handles JSON payload', async () => {
		const key = await deriveRoomKey('testroom')
		const data = { backlog: [{ id: '1', title: 'Test' }], unit: 'points' }
		const ct = await encrypt(key, JSON.stringify(data))
		const result = JSON.parse(await decrypt(key, ct))
		expect(result).toEqual(data)
	})
})
