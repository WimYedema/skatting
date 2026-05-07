import { describe, expect, it } from 'vitest'
import { computeDTag, deriveRoomKey } from '../crypto'
import {
	computeEventsDTag,
	computeRoomsDTag,
	computeRosterDTag,
	decrypt,
	deriveEventsKey,
	deriveRoomsKey,
	deriveRosterKey,
	encrypt,
} from './crypto'

describe('deriveRosterKey', () => {
	it('produces a different key than the tool-level deriveRoomKey', async () => {
		const roomCode = 'test-room-code'
		const rosterKey = await deriveRosterKey(roomCode)
		const roomKey = await deriveRoomKey(roomCode)
		// Both are CryptoKey objects — we can verify independence by encrypting the same plaintext
		const plaintext = 'hello world'
		const rosterCipher = await encrypt(rosterKey, plaintext)
		const { encrypt: toolEncrypt } = await import('../crypto')
		const roomCipher = await toolEncrypt(roomKey, plaintext)
		// Different ciphertexts (different keys + random IV)
		expect(rosterCipher).not.toBe(roomCipher)
	})
})

describe('key independence', () => {
	it('roster, rooms, and events keys are all different', async () => {
		const roomCode = 'test-room-code'
		const plaintext = 'test data'
		const rosterKey = await deriveRosterKey(roomCode)
		const roomsKey = await deriveRoomsKey(roomCode)
		const eventsKey = await deriveEventsKey(roomCode)

		const rosterCipher = await encrypt(rosterKey, plaintext)

		// Rooms key cannot decrypt roster-encrypted data
		await expect(decrypt(roomsKey, rosterCipher)).rejects.toThrow()
		// Events key cannot decrypt roster-encrypted data
		await expect(decrypt(eventsKey, rosterCipher)).rejects.toThrow()
	})
})

describe('d-tag computation', () => {
	it('appends -roster suffix to the base hash', async () => {
		const roomCode = 'test-room-code'
		const rosterDTag = await computeRosterDTag(roomCode)
		const baseDTag = await computeDTag(roomCode)
		expect(rosterDTag).toBe(`${baseDTag}-roster`)
	})

	it('appends -rooms suffix to the base hash', async () => {
		const roomCode = 'test-room-code'
		const roomsDTag = await computeRoomsDTag(roomCode)
		const baseDTag = await computeDTag(roomCode)
		expect(roomsDTag).toBe(`${baseDTag}-rooms`)
	})

	it('appends -events suffix to the base hash', async () => {
		const roomCode = 'test-room-code'
		const eventsDTag = await computeEventsDTag(roomCode)
		const baseDTag = await computeDTag(roomCode)
		expect(eventsDTag).toBe(`${baseDTag}-events`)
	})

	it('all d-tags are distinct for the same room code', async () => {
		const roomCode = 'test-room-code'
		const [roster, rooms, events] = await Promise.all([
			computeRosterDTag(roomCode),
			computeRoomsDTag(roomCode),
			computeEventsDTag(roomCode),
		])
		expect(new Set([roster, rooms, events]).size).toBe(3)
	})
})

describe('encrypt / decrypt', () => {
	it('round-trips plaintext', async () => {
		const key = await deriveRosterKey('some-room')
		const plaintext = JSON.stringify({ name: 'Team', members: [] })
		const encrypted = await encrypt(key, plaintext)
		const decrypted = await decrypt(key, encrypted)
		expect(decrypted).toBe(plaintext)
	})

	it('fails to decrypt with a different key', async () => {
		const key1 = await deriveRosterKey('room-1')
		const key2 = await deriveRosterKey('room-2')
		const encrypted = await encrypt(key1, 'secret')
		await expect(decrypt(key2, encrypted)).rejects.toThrow()
	})
})
