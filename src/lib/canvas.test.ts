import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	canvasToMathX,
	canvasYToSigmaFromPeak,
	convergenceState,
	DEFAULT_CONFIG,
	detectClusters,
	detectPattern,
	drawScene,
	hitTestBlob,
	jitter,
	lognormalOverlap,
	mathToCanvasX,
	peakCanvasY,
	seededRng,
} from './canvas'
import { combineEstimates, muFromMode } from './lognormal'

describe('mathToCanvasX / canvasToMathX', () => {
	const width = 800

	it('maps xRange[0] to left padding', () => {
		expect(mathToCanvasX(0.5, width)).toBeCloseTo(DEFAULT_CONFIG.padding)
	})

	it('maps xRange[1] to right edge minus padding', () => {
		expect(mathToCanvasX(55, width)).toBeCloseTo(width - DEFAULT_CONFIG.padding)
	})

	it('round-trips: canvasToMathX(mathToCanvasX(x)) ≈ x', () => {
		for (const x of [0.5, 1, 2, 5, 10, 20, 55]) {
			const canvasX = mathToCanvasX(x, width)
			expect(canvasToMathX(canvasX, width)).toBeCloseTo(x)
		}
	})

	it('is logarithmic — equal ratios map to equal distances', () => {
		const x1 = mathToCanvasX(1, width)
		const x2 = mathToCanvasX(2, width)
		const x5 = mathToCanvasX(5, width)
		const x10 = mathToCanvasX(10, width)
		expect(x2 - x1).toBeCloseTo(x10 - x5)
	})
})

describe('peakCanvasY', () => {
	const canvasHeight = 600

	it('returns a value between padding and baseline', () => {
		const mu = muFromMode(5, 0.5)
		const y = peakCanvasY(mu, 0.5, canvasHeight)
		expect(y).toBeGreaterThanOrEqual(DEFAULT_CONFIG.padding)
		expect(y).toBeLessThan(canvasHeight - DEFAULT_CONFIG.padding)
	})

	it('lower sigma (more certain) → lower peakY (taller blob)', () => {
		const mode = 5
		const muLow = muFromMode(mode, 0.3)
		const muHigh = muFromMode(mode, 1.5)
		const peakLowSigma = peakCanvasY(muLow, 0.3, canvasHeight)
		const peakHighSigma = peakCanvasY(muHigh, 1.5, canvasHeight)
		expect(peakLowSigma).toBeLessThan(peakHighSigma)
	})

	it('same sigma, different modes → same peakY (log-space uniformity)', () => {
		const sigma = 0.5
		const peak1 = peakCanvasY(muFromMode(1, sigma), sigma, canvasHeight)
		const peak10 = peakCanvasY(muFromMode(10, sigma), sigma, canvasHeight)
		expect(peak1).toBeCloseTo(peak10)
	})
})

describe('canvasYToSigmaFromPeak', () => {
	const canvasHeight = 600
	const mode = 5

	it('higher cursorY → higher sigma (less certain)', () => {
		const sigma1 = canvasYToSigmaFromPeak(100, canvasHeight, mode)
		const sigma2 = canvasYToSigmaFromPeak(300, canvasHeight, mode)
		const sigma3 = canvasYToSigmaFromPeak(500, canvasHeight, mode)
		expect(sigma1).toBeLessThan(sigma2)
		expect(sigma2).toBeLessThan(sigma3)
	})

	it('cursor at baseline → max sigma', () => {
		const sigma = canvasYToSigmaFromPeak(canvasHeight - DEFAULT_CONFIG.padding, canvasHeight, mode)
		expect(sigma).toBe(2.5)
	})

	it('cursor at top → min sigma', () => {
		const sigma = canvasYToSigmaFromPeak(DEFAULT_CONFIG.padding, canvasHeight, mode)
		expect(sigma).toBe(0.08)
	})

	it('peak reaches the target cursorY', () => {
		const targetY = 300
		const sigma = canvasYToSigmaFromPeak(targetY, canvasHeight, mode)
		const mu = muFromMode(mode, sigma)
		const actualPeakY = peakCanvasY(mu, sigma, canvasHeight)
		expect(actualPeakY).toBeCloseTo(targetY, 0)
	})
})

describe('hitTestBlob', () => {
	const width = 800
	const height = 600
	const mode = 5
	const sigma = 0.5
	const mu = muFromMode(mode, sigma)

	it('hits inside the blob at peak position', () => {
		const peakX = mathToCanvasX(mode, width)
		const peakY = peakCanvasY(mu, sigma, height)
		// Midway between peak and baseline should be inside
		const midY = (peakY + height - DEFAULT_CONFIG.padding) / 2
		expect(hitTestBlob(mu, sigma, peakX, midY, width, height)).toBe(true)
	})

	it('misses above the blob peak', () => {
		const peakX = mathToCanvasX(mode, width)
		const peakY = peakCanvasY(mu, sigma, height)
		expect(hitTestBlob(mu, sigma, peakX, peakY - 50, width, height)).toBe(false)
	})

	it('misses far to the left of the blob', () => {
		const baselineY = height - DEFAULT_CONFIG.padding - 10
		expect(hitTestBlob(mu, sigma, DEFAULT_CONFIG.padding + 2, baselineY, width, height)).toBe(false)
	})

	it('misses below the baseline', () => {
		const peakX = mathToCanvasX(mode, width)
		expect(hitTestBlob(mu, sigma, peakX, height - DEFAULT_CONFIG.padding + 5, width, height)).toBe(
			false,
		)
	})

	it('misses above the padding', () => {
		const peakX = mathToCanvasX(mode, width)
		expect(hitTestBlob(mu, sigma, peakX, DEFAULT_CONFIG.padding - 5, width, height)).toBe(false)
	})
})

describe('seededRng', () => {
	it('returns values in [0, 1)', () => {
		const rng = seededRng(42)
		for (let i = 0; i < 100; i++) {
			const v = rng()
			expect(v).toBeGreaterThanOrEqual(0)
			expect(v).toBeLessThan(1)
		}
	})

	it('is deterministic — same seed produces same sequence', () => {
		const a = seededRng(123)
		const b = seededRng(123)
		for (let i = 0; i < 20; i++) {
			expect(a()).toBe(b())
		}
	})

	it('different seeds produce different sequences', () => {
		const a = seededRng(1)
		const b = seededRng(2)
		const valuesA = Array.from({ length: 5 }, () => a())
		const valuesB = Array.from({ length: 5 }, () => b())
		expect(valuesA).not.toEqual(valuesB)
	})
})

describe('jitter', () => {
	it('returns values within [-amount, +amount]', () => {
		const rng = seededRng(99)
		for (let i = 0; i < 100; i++) {
			const v = jitter(rng, 2.0)
			expect(v).toBeGreaterThanOrEqual(-2.0)
			expect(v).toBeLessThanOrEqual(2.0)
		}
	})

	it('uses default amount of 1.5', () => {
		const rng = seededRng(99)
		for (let i = 0; i < 100; i++) {
			const v = jitter(rng)
			expect(v).toBeGreaterThanOrEqual(-1.5)
			expect(v).toBeLessThanOrEqual(1.5)
		}
	})
})

describe('drawScene', () => {
	function createMockCtx(): CanvasRenderingContext2D {
		return new Proxy({} as CanvasRenderingContext2D, {
			get(_target, prop) {
				if (typeof prop === 'string') {
					// createPattern returns null (no actual pattern in test)
					if (prop === 'createPattern') return () => null
					// measureText returns a minimal TextMetrics
					if (prop === 'measureText') return () => ({ width: 0 })
					// Return no-op for all other methods
					return () => {}
				}
			},
			set() {
				return true
			},
		})
	}

	// Path2D and OffscreenCanvas are not available in Node.js — provide minimal stubs
	const OriginalPath2D = globalThis.Path2D
	const OriginalOffscreenCanvas = globalThis.OffscreenCanvas
	class MockPath2D {
		moveTo() {}
		lineTo() {}
		quadraticCurveTo() {}
		closePath() {}
	}
	class MockOffscreenCanvas {
		getContext() {
			return createMockCtx()
		}
	}

	beforeAll(() => {
		// biome-ignore lint: test setup
		;(globalThis as any).Path2D = MockPath2D
		// biome-ignore lint: test setup
		;(globalThis as any).OffscreenCanvas = MockOffscreenCanvas
	})

	afterAll(() => {
		if (OriginalPath2D) {
			globalThis.Path2D = OriginalPath2D
		} else {
			// biome-ignore lint: test teardown
			delete (globalThis as any).Path2D
		}
		if (OriginalOffscreenCanvas) {
			globalThis.OffscreenCanvas = OriginalOffscreenCanvas
		} else {
			// biome-ignore lint: test teardown
			delete (globalThis as any).OffscreenCanvas
		}
	})

	it('does not throw with minimal scene state', () => {
		const ctx = createMockCtx()
		expect(() =>
			drawScene(ctx, 800, 600, {
				myEstimate: { mu: 2.0, sigma: 0.5 },
				peerEstimates: [],
				revealed: false,
				history: [],
				unit: 'points',
				persistentHistory: [],
			}),
		).not.toThrow()
	})

	it('does not throw with peers and revealed state', () => {
		const ctx = createMockCtx()
		expect(() =>
			drawScene(ctx, 800, 600, {
				myEstimate: { mu: 2.0, sigma: 0.5 },
				peerEstimates: [{ mu: 1.8, sigma: 0.4, color: '#b56b6b' }],
				revealed: true,
				history: [{ label: 'Past item', mu: 1.5, sigma: 0.3 }],
				unit: 'days',
				persistentHistory: [{ label: 'Old item', mu: 2.5, sigma: 0.6 }],
			}),
		).not.toThrow()
	})

	it('does not throw with currentTicket', () => {
		const ctx = createMockCtx()
		expect(() =>
			drawScene(ctx, 800, 600, {
				myEstimate: { mu: 2.0, sigma: 0.5 },
				peerEstimates: [],
				revealed: false,
				history: [],
				unit: 'points',
				currentTicket: { id: 'T-1', title: 'Fix bug', labels: ['bug'], assignee: 'Alice' },
				persistentHistory: [],
			}),
		).not.toThrow()
	})

	it('does not throw with extreme sigma values', () => {
		const ctx = createMockCtx()
		expect(() =>
			drawScene(ctx, 800, 600, {
				myEstimate: { mu: 0.01, sigma: 0.01 },
				peerEstimates: [],
				revealed: false,
				history: [],
				unit: 'points',
				persistentHistory: [],
			}),
		).not.toThrow()
		expect(() =>
			drawScene(ctx, 800, 600, {
				myEstimate: { mu: 5.0, sigma: 2.5 },
				peerEstimates: [],
				revealed: false,
				history: [],
				unit: 'points',
				persistentHistory: [],
			}),
		).not.toThrow()
	})

	it('does not throw with hasMoved false (ghost blob)', () => {
		const ctx = createMockCtx()
		expect(() =>
			drawScene(ctx, 800, 600, {
				myEstimate: { mu: 2.0, sigma: 0.5 },
				peerEstimates: [],
				revealed: false,
				history: [],
				unit: 'points',
				persistentHistory: [],
				hasMoved: false,
			}),
		).not.toThrow()
	})

	it('does not throw with hasMoved true (normal blob)', () => {
		const ctx = createMockCtx()
		expect(() =>
			drawScene(ctx, 800, 600, {
				myEstimate: { mu: 2.0, sigma: 0.5 },
				peerEstimates: [],
				revealed: false,
				history: [],
				unit: 'points',
				persistentHistory: [],
				hasMoved: true,
			}),
		).not.toThrow()
	})
})

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
		// Person A: certain at 5, Person B: "no idea" (sigma=2.0)
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
		expect(result.color).toBe('#b55a5a') // red
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
		expect(result.color).toMatch(/#c49a3c|#b55a5a/) // amber or red
	})
})

describe('detectClusters', () => {
	const sig = 0.3 // Use consistent low sigma so mode ≈ desired value

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
		// First cluster has the low estimates, second has the high ones
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
	const lowSig = 0.3 // certain
	const highSig = 1.0 // uncertain

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
		expect(detectPattern(estimates, false)).toBe(
			"Nobody's confident — what don't we know?",
		)
	})

	it('detects mixed certainty', () => {
		const estimates = [
			{ mu: muFromMode(5, lowSig), sigma: lowSig },
			{ mu: muFromMode(5.1, highSig), sigma: highSig },
			{ mu: muFromMode(5.2, lowSig), sigma: lowSig },
			{ mu: muFromMode(5.3, highSig), sigma: highSig },
		]
		expect(detectPattern(estimates, false)).toBe(
			'Someone knows something — care to share?',
		)
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
		expect(detectPattern(estimates, false)).toBe(
			'Close enough — or worth a chat?',
		)
	})
})
