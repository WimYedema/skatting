import { describe, expect, it } from 'vitest'
import { convergenceState, detectClusters, detectPattern, lognormalOverlap } from './facilitation'
import { combineEstimates, muFromMode } from './lognormal'

describe('lognormalOverlap', () => {
	it('returns ~1 for identical distributions', () => {
		const mu = muFromMode(5, 0.5)
		expect(lognormalOverlap(mu, 0.5, mu, 0.5)).toBeGreaterThan(0.95)
	})

	it('returns low overlap for far-apart distributions', () => {
		const a = muFromMode(2, 0.4)
		const b = muFromMode(21, 0.4)
		expect(lognormalOverlap(a, 0.4, b, 0.4)).toBeLessThan(0.05)
	})

	it('returns moderate overlap for nearby distributions', () => {
		const a = muFromMode(3, 0.5)
		const b = muFromMode(5, 0.5)
		const ov = lognormalOverlap(a, 0.5, b, 0.5)
		expect(ov).toBeGreaterThan(0.1)
		expect(ov).toBeLessThan(0.7)
	})

	it('returns low overlap when one distribution is very flat', () => {
		const a = muFromMode(5, 0.3)
		const b = muFromMode(5, 2.0)
		expect(lognormalOverlap(a, 0.3, b, 2.0)).toBeLessThan(0.35)
	})
})

describe('convergenceState', () => {
	it('returns green/converged for solo with low sigma', () => {
		const result = convergenceState(muFromMode(5, 0.3), 0.3)
		expect(result.converged).toBe(true)
		expect(result.color).toBe('#4a8c5c')
		expect(result.overlap).toBeGreaterThan(0.5)
	})

	it('returns red/divergent for solo with high sigma', () => {
		const result = convergenceState(muFromMode(5, 1.0), 1.0)
		expect(result.converged).toBe(false)
		expect(result.overlap).toBeLessThan(0.25)
	})

	it('overlap is between 0 and 1', () => {
		const result = convergenceState(muFromMode(1, 0.5), 0.5)
		expect(result.overlap).toBeGreaterThan(0)
		expect(result.overlap).toBeLessThanOrEqual(1)
	})

	it('detects divergence from far-apart estimates', () => {
		const sig = 0.4
		const estA = { mu: muFromMode(1.5, sig), sigma: sig }
		const estB = { mu: muFromMode(21, sig), sigma: sig }
		const combined = combineEstimates([estA, estB])!
		const result = convergenceState(combined.mu, combined.sigma, [estA, estB])
		expect(result.converged).toBe(false)
		expect(result.color).toBe('#b55a5a')
		expect(result.overlap).toBeLessThan(0.05)
	})

	it('converges when estimates are close', () => {
		const sig = 0.3
		const estA = { mu: muFromMode(5, sig), sigma: sig }
		const estB = { mu: muFromMode(6, sig), sigma: sig }
		const combined = combineEstimates([estA, estB])!
		const result = convergenceState(combined.mu, combined.sigma, [estA, estB])
		expect(result.converged).toBe(true)
		expect(result.overlap).toBeGreaterThan(0.5)
	})

	it('detects divergence when one person is maximally uncertain', () => {
		const estA = { mu: muFromMode(1.5, 0.3), sigma: 0.3 }
		const estB = { mu: muFromMode(1.5, 2.0), sigma: 2.0 }
		const combined = combineEstimates([estA, estB])!
		const result = convergenceState(combined.mu, combined.sigma, [estA, estB])
		expect(result.converged).toBe(false)
		expect(result.overlap).toBeLessThan(0.5)
	})

	it('detects amber for moderate disagreement (modes 1.5× apart)', () => {
		const sig = 0.4
		const estA = { mu: muFromMode(2, sig), sigma: sig }
		const estB = { mu: muFromMode(5, sig), sigma: sig }
		const combined = combineEstimates([estA, estB])!
		const result = convergenceState(combined.mu, combined.sigma, [estA, estB])
		expect(result.converged).toBe(false)
		expect(result.color).toMatch(/#c49a3c|#b55a5a/)
	})
})

describe('detectClusters', () => {
	const sig = 0.3

	it('returns empty array for no estimates', () => {
		expect(detectClusters([])).toEqual([])
	})

	it('returns one cluster for a single estimate', () => {
		const clusters = detectClusters([{ mu: muFromMode(5, sig), sigma: sig }])
		expect(clusters).toHaveLength(1)
		expect(clusters[0].members).toEqual([0])
		expect(clusters[0].medianMode).toBeCloseTo(5, 0)
	})

	it('returns one cluster when all estimates are close', () => {
		const estimates = [
			{ mu: muFromMode(5, sig), sigma: sig },
			{ mu: muFromMode(5.2, sig), sigma: sig },
			{ mu: muFromMode(5.5, sig), sigma: sig },
			{ mu: muFromMode(5.8, sig), sigma: sig },
			{ mu: muFromMode(6, sig), sigma: sig },
		]
		const clusters = detectClusters(estimates)
		expect(clusters).toHaveLength(1)
		expect(clusters[0].members).toHaveLength(5)
	})

	it('detects two clusters when there is a large gap', () => {
		const estimates = [
			{ mu: muFromMode(3, sig), sigma: sig },
			{ mu: muFromMode(3.5, sig), sigma: sig },
			{ mu: muFromMode(13, sig), sigma: sig },
			{ mu: muFromMode(14, sig), sigma: sig },
		]
		const clusters = detectClusters(estimates)
		expect(clusters).toHaveLength(2)
		expect(clusters[0].medianMode).toBeLessThan(8)
		expect(clusters[1].medianMode).toBeGreaterThan(8)
	})

	it('detects three clusters for three distinct groups', () => {
		const estimates = [
			{ mu: muFromMode(2, sig), sigma: sig },
			{ mu: muFromMode(3, sig), sigma: sig },
			{ mu: muFromMode(10, sig), sigma: sig },
			{ mu: muFromMode(11, sig), sigma: sig },
			{ mu: muFromMode(25, sig), sigma: sig },
			{ mu: muFromMode(26, sig), sigma: sig },
		]
		const clusters = detectClusters(estimates)
		expect(clusters.length).toBeGreaterThanOrEqual(2)
		expect(clusters.length).toBeLessThanOrEqual(3)
	})

	it('all member indices are present exactly once', () => {
		const estimates = [
			{ mu: muFromMode(3, sig), sigma: sig },
			{ mu: muFromMode(13, sig), sigma: sig },
			{ mu: muFromMode(5, sig), sigma: sig },
		]
		const clusters = detectClusters(estimates)
		const allMembers = clusters.flatMap((c) => c.members).sort()
		expect(allMembers).toEqual([0, 1, 2])
	})

	it('handles identical estimates (zero range)', () => {
		const estimates = [
			{ mu: muFromMode(5, sig), sigma: sig },
			{ mu: muFromMode(5, sig), sigma: sig },
			{ mu: muFromMode(5, sig), sigma: sig },
		]
		const clusters = detectClusters(estimates)
		expect(clusters).toHaveLength(1)
		expect(clusters[0].members).toHaveLength(3)
	})
})

describe('detectPattern', () => {
	const lowSig = 0.3
	const highSig = 1.0

	it('returns empty for no estimates', () => {
		expect(detectPattern([], false)).toBe('')
	})

	it('returns "on the same page" when converged', () => {
		const estimates = [
			{ mu: muFromMode(5, lowSig), sigma: lowSig },
			{ mu: muFromMode(5.5, lowSig), sigma: lowSig },
		]
		expect(detectPattern(estimates, true)).toBe("You're all on the same page")
	})

	it('detects two camps', () => {
		const estimates = [
			{ mu: muFromMode(3, lowSig), sigma: lowSig },
			{ mu: muFromMode(3.5, lowSig), sigma: lowSig },
			{ mu: muFromMode(13, lowSig), sigma: lowSig },
			{ mu: muFromMode(14, lowSig), sigma: lowSig },
		]
		expect(detectPattern(estimates, false)).toBe(
			'Two camps — looks like you have something to talk about',
		)
	})

	it('detects all uncertain', () => {
		const estimates = [
			{ mu: muFromMode(5, highSig), sigma: highSig },
			{ mu: muFromMode(6, highSig), sigma: highSig },
		]
		expect(detectPattern(estimates, false)).toBe("Nobody's confident — what don't we know?")
	})

	it('detects mixed certainty', () => {
		const estimates = [
			{ mu: muFromMode(5, lowSig), sigma: lowSig },
			{ mu: muFromMode(5.1, highSig), sigma: highSig },
			{ mu: muFromMode(5.2, lowSig), sigma: lowSig },
			{ mu: muFromMode(5.3, highSig), sigma: highSig },
		]
		expect(detectPattern(estimates, false)).toBe('Someone knows something — care to share?')
	})

	it('returns "close enough" for mild divergent single cluster', () => {
		const midSig = 0.5
		const estimates = [
			{ mu: muFromMode(5.0, midSig), sigma: midSig },
			{ mu: muFromMode(5.3, midSig), sigma: midSig },
			{ mu: muFromMode(5.6, midSig), sigma: midSig },
			{ mu: muFromMode(5.9, midSig), sigma: midSig },
			{ mu: muFromMode(6.2, midSig), sigma: midSig },
		]
		expect(detectPattern(estimates, false)).toBe('Close enough — or worth a chat?')
	})
})
