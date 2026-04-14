import { describe, expect, it } from 'vitest'
import type { EstimatedTicket, HistoryEntry } from './types'
import { applyVerdict, computeVerdict, upsertHistory } from './verdict'

describe('computeVerdict', () => {
	it('returns combined verdict from multiple estimates', () => {
		const result = computeVerdict('Task A', { mu: 2.0, sigma: 0.5 }, [{ mu: 1.8, sigma: 0.4 }])
		expect(result).not.toBeNull()
		expect(result!.historyEntry.label).toBe('Task A')
		expect(result!.median).toBeGreaterThan(0)
		expect(result!.p10).toBeLessThan(result!.median)
		expect(result!.p90).toBeGreaterThan(result!.median)
	})

	it('returns solo verdict when no peers', () => {
		const result = computeVerdict('Solo', { mu: 2.0, sigma: 0.5 }, [])
		expect(result).not.toBeNull()
		expect(result!.mu).toBe(2.0)
		expect(result!.sigma).toBe(0.5)
	})

	it('combined estimate is more certain than any individual', () => {
		const result = computeVerdict('Combined', { mu: 2.0, sigma: 0.5 }, [{ mu: 2.1, sigma: 0.6 }])
		expect(result).not.toBeNull()
		expect(result!.sigma).toBeLessThan(0.5)
	})

	it('uses label from input', () => {
		const result = computeVerdict('My Label', { mu: 1.0, sigma: 0.3 }, [])
		expect(result!.historyEntry.label).toBe('My Label')
	})

	it('p10 < median < p90', () => {
		const result = computeVerdict('Range check', { mu: 2.0, sigma: 0.5 }, [])
		expect(result!.p10).toBeLessThan(result!.median)
		expect(result!.p90).toBeGreaterThan(result!.median)
	})
})

describe('applyVerdict', () => {
	it('sets median, p10, p90, and unit on ticket', () => {
		const ticket: EstimatedTicket = { id: 'T-1', title: 'Test' }
		const verdict = computeVerdict('T-1', { mu: 2.0, sigma: 0.5 }, [])!
		applyVerdict(ticket, verdict, 'points')
		expect(ticket.median).toBe(verdict.median)
		expect(ticket.p10).toBe(verdict.p10)
		expect(ticket.p90).toBe(verdict.p90)
		expect(ticket.estimateUnit).toBe('points')
	})

	it('overwrites existing verdict', () => {
		const ticket: EstimatedTicket = {
			id: 'T-1',
			title: 'Test',
			median: 1,
			p10: 0.5,
			p90: 2,
			estimateUnit: 'days',
		}
		const verdict = computeVerdict('T-1', { mu: 3.0, sigma: 0.3 }, [])!
		applyVerdict(ticket, verdict, 'points')
		expect(ticket.median).toBe(verdict.median)
		expect(ticket.estimateUnit).toBe('points')
	})
})

describe('upsertHistory', () => {
	const base: HistoryEntry[] = [
		{ label: 'A', mu: 1.0, sigma: 0.3 },
		{ label: 'B', mu: 2.0, sigma: 0.5 },
	]

	it('appends new entry', () => {
		const result = upsertHistory(base, { label: 'C', mu: 3.0, sigma: 0.4 })
		expect(result).toHaveLength(3)
		expect(result[2].label).toBe('C')
	})

	it('replaces existing entry by label', () => {
		const result = upsertHistory(base, { label: 'A', mu: 9.0, sigma: 0.1 })
		expect(result).toHaveLength(2)
		expect(result[0].mu).toBe(9.0)
	})

	it('does not mutate original array', () => {
		const result = upsertHistory(base, { label: 'A', mu: 9.0, sigma: 0.1 })
		expect(base[0].mu).toBe(1.0)
		expect(result).not.toBe(base)
	})

	it('handles empty history', () => {
		const result = upsertHistory([], { label: 'First', mu: 1.0, sigma: 0.5 })
		expect(result).toHaveLength(1)
	})
})
