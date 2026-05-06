import { describe, expect, it } from 'vitest'
import { createEvent } from './events'

describe('createEvent', () => {
	it('builds a correctly shaped SamenEvent envelope', () => {
		const payload = { deliverables: [{ id: '1', title: 'Search API' }], unit: 'points' }
		const event = createEvent('slim:estimation-request', 1, payload, 'member-uuid-123')

		expect(event.type).toBe('slim:estimation-request')
		expect(event.version).toBe(1)
		expect(event.payload).toEqual(payload)
		expect(event.publishedBy).toBe('member-uuid-123')
		expect(event.publishedAt).toBeGreaterThan(0)
	})

	it('handles anonymous publisher', () => {
		const event = createEvent('skatting:verdicts', 1, {}, 'anonymous')
		expect(event.publishedBy).toBe('anonymous')
	})

	it('preserves arbitrary payload shapes', () => {
		const payload = { nested: { deep: [1, 2, 3] }, flag: true }
		const event = createEvent('bouwen:dependencies', 1, payload, 'member-1')
		expect(event.payload).toEqual(payload)
	})
})
