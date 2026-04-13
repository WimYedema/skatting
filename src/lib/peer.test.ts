import { describe, expect, it } from 'vitest'
import { generateRoomId, getPeerColor } from './peer'
import { PEER_COLORS } from './types'

describe('getPeerColor', () => {
	const peerIds = ['alice', 'bob', 'charlie']

	it('returns a color from PEER_COLORS', () => {
		const color = getPeerColor('alice', peerIds)
		expect(PEER_COLORS).toContain(color)
	})

	it('assigns colors by index order', () => {
		expect(getPeerColor('alice', peerIds)).toBe(PEER_COLORS[0])
		expect(getPeerColor('bob', peerIds)).toBe(PEER_COLORS[1])
		expect(getPeerColor('charlie', peerIds)).toBe(PEER_COLORS[2])
	})

	it('wraps around when more peers than colors', () => {
		const manyPeers = Array.from({ length: PEER_COLORS.length + 2 }, (_, i) => `peer${i}`)
		const lastPeer = manyPeers[PEER_COLORS.length]
		expect(getPeerColor(lastPeer, manyPeers)).toBe(PEER_COLORS[0])
	})

	it('returns first color for unknown peer', () => {
		const color = getPeerColor('unknown', peerIds)
		expect(color).toBe(PEER_COLORS[0])
	})
})

describe('generateRoomId', () => {
	it('returns a 5-character string', () => {
		const id = generateRoomId()
		expect(id).toHaveLength(5)
	})

	it('only contains allowed characters (no ambiguous chars)', () => {
		// Excluded: i, l, o, 0, 1
		const allowed = /^[a-hjk-np-z2-9]+$/
		for (let i = 0; i < 50; i++) {
			expect(generateRoomId()).toMatch(allowed)
		}
	})

	it('generates different IDs on subsequent calls', () => {
		const ids = new Set(Array.from({ length: 20 }, () => generateRoomId()))
		// With 29^5 ≈ 20M combinations, 20 calls should all be unique
		expect(ids.size).toBe(20)
	})
})
