import { describe, expect, it } from 'vitest'
import {
	combineEstimates,
	generateBlobPoints,
	lognormalCdf,
	lognormalMean,
	lognormalMode,
	lognormalPdf,
	lognormalQuantile,
	muFromMode,
	snapVerdict,
} from './lognormal'

describe('lognormalPdf', () => {
	it('returns 0 for x <= 0', () => {
		expect(lognormalPdf(0, 1, 0.5)).toBe(0)
		expect(lognormalPdf(-1, 1, 0.5)).toBe(0)
	})

	it('returns a positive value for x > 0', () => {
		expect(lognormalPdf(1, 0, 1)).toBeGreaterThan(0)
	})

	it('peaks near the mode', () => {
		const mu = 1
		const sigma = 0.5
		const mode = Math.exp(mu - sigma ** 2)
		const atMode = lognormalPdf(mode, mu, sigma)
		const belowMode = lognormalPdf(mode * 0.5, mu, sigma)
		const aboveMode = lognormalPdf(mode * 2, mu, sigma)
		expect(atMode).toBeGreaterThan(belowMode)
		expect(atMode).toBeGreaterThan(aboveMode)
	})

	it('is right-skewed (right tail longer than left)', () => {
		const mu = 1
		const sigma = 0.5
		const mode = Math.exp(mu - sigma ** 2)
		// Value far right of mode should be > value equally far left
		const farRight = lognormalPdf(mode + 3, mu, sigma)
		const farLeft = lognormalPdf(Math.max(0.01, mode - 3), mu, sigma)
		// Both tails are low, but right tail extends further
		expect(farRight).toBeGreaterThan(0)
		expect(farLeft).toBeLessThan(lognormalPdf(mode, mu, sigma))
	})
})

describe('lognormalMode', () => {
	it('computes mode = exp(mu - sigma^2)', () => {
		expect(lognormalMode(1, 0.5)).toBeCloseTo(Math.exp(1 - 0.25))
		expect(lognormalMode(2, 1)).toBeCloseTo(Math.exp(2 - 1))
	})
})

describe('lognormalMean', () => {
	it('computes mean = exp(mu + sigma^2/2)', () => {
		expect(lognormalMean(1, 0.5)).toBeCloseTo(Math.exp(1 + 0.125))
		expect(lognormalMean(0, 1)).toBeCloseTo(Math.exp(0.5))
	})

	it('mean > mode for sigma > 0 (right skew)', () => {
		const mu = 1
		const sigma = 0.5
		expect(lognormalMean(mu, sigma)).toBeGreaterThan(lognormalMode(mu, sigma))
	})
})

describe('muFromMode', () => {
	it('round-trips: lognormalMode(muFromMode(mode, sigma), sigma) ≈ mode', () => {
		const mode = 5
		const sigma = 0.7
		const mu = muFromMode(mode, sigma)
		expect(lognormalMode(mu, sigma)).toBeCloseTo(mode)
	})

	it('works across a range of sigma values', () => {
		for (const sigma of [0.2, 0.5, 1.0, 1.5, 2.0]) {
			const mode = 3
			const mu = muFromMode(mode, sigma)
			expect(lognormalMode(mu, sigma)).toBeCloseTo(mode, 4)
		}
	})

	it('clamps near-zero mode to avoid -Infinity', () => {
		const mu = muFromMode(0, 1.0)
		expect(Number.isFinite(mu)).toBe(true)
	})
})

describe('generateBlobPoints', () => {
	it('returns the expected number of points', () => {
		const points = generateBlobPoints(1, 0.5, 2, 100)
		expect(points).toHaveLength(100)
	})

	it('all x values are positive', () => {
		const points = generateBlobPoints(1, 0.5, 2)
		for (const p of points) {
			expect(p.x).toBeGreaterThan(0)
		}
	})

	it('all y values are non-negative', () => {
		const points = generateBlobPoints(1, 0.5, 2)
		for (const p of points) {
			expect(p.y).toBeGreaterThanOrEqual(0)
		}
	})

	it('scales to the target area', () => {
		const targetArea = 5
		const points = generateBlobPoints(1, 0.5, targetArea)
		// Compute area via trapezoid rule
		let area = 0
		for (let i = 1; i < points.length; i++) {
			const dx = points[i].x - points[i - 1].x
			area += ((points[i - 1].y + points[i].y) / 2) * dx
		}
		expect(area).toBeCloseTo(targetArea, 1)
	})

	it('area stays constant when sigma changes', () => {
		const targetArea = 3
		const area1 = computeArea(generateBlobPoints(1, 0.3, targetArea))
		const area2 = computeArea(generateBlobPoints(1, 1.0, targetArea))
		const area3 = computeArea(generateBlobPoints(1, 1.8, targetArea))
		expect(area1).toBeCloseTo(targetArea, 1)
		expect(area2).toBeCloseTo(targetArea, 1)
		expect(area3).toBeCloseTo(targetArea, 1)
	})
})

function computeArea(points: Array<{ x: number; y: number }>): number {
	let area = 0
	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - points[i - 1].x
		area += ((points[i - 1].y + points[i].y) / 2) * dx
	}
	return area
}

describe('combineEstimates', () => {
	it('returns null for empty array', () => {
		expect(combineEstimates([])).toBeNull()
	})

	it('returns the single estimate unchanged', () => {
		const result = combineEstimates([{ mu: 2, sigma: 0.5 }])
		expect(result).toEqual({ mu: 2, sigma: 0.5 })
	})

	it('combined sigma is narrower than any individual', () => {
		const result = combineEstimates([
			{ mu: 1, sigma: 0.5 },
			{ mu: 2, sigma: 0.8 },
		])
		expect(result).not.toBeNull()
		expect(result?.sigma).toBeLessThan(0.5)
	})

	it('weights toward more certain estimates', () => {
		const result = combineEstimates([
			{ mu: 1, sigma: 0.2 }, // very certain
			{ mu: 3, sigma: 2.0 }, // very uncertain
		])
		expect(result).not.toBeNull()
		// Combined mu should be much closer to 1 than to 3
		expect(result?.mu).toBeCloseTo(1, 0)
	})

	it('identical estimates yield the same mu', () => {
		const result = combineEstimates([
			{ mu: 2, sigma: 0.6 },
			{ mu: 2, sigma: 0.6 },
		])
		expect(result).not.toBeNull()
		expect(result?.mu).toBeCloseTo(2, 5)
	})

	it('filters out sigma=0 estimates (division by zero guard)', () => {
		const result = combineEstimates([
			{ mu: 2, sigma: 0 },
			{ mu: 3, sigma: 0.5 },
		])
		expect(result).not.toBeNull()
		expect(result?.mu).toBeCloseTo(3)
		expect(result?.sigma).toBeCloseTo(0.5)
	})

	it('returns null if all estimates have sigma=0', () => {
		const result = combineEstimates([
			{ mu: 1, sigma: 0 },
			{ mu: 2, sigma: 0 },
		])
		expect(result).toBeNull()
	})

	it('handles negative sigma by filtering', () => {
		const result = combineEstimates([
			{ mu: 1, sigma: -1 },
			{ mu: 2, sigma: 0.5 },
		])
		expect(result).not.toBeNull()
		expect(result?.mu).toBeCloseTo(2)
	})

	it('handles Infinity sigma by filtering', () => {
		const result = combineEstimates([
			{ mu: 1, sigma: Infinity },
			{ mu: 2, sigma: 0.5 },
		])
		expect(result).not.toBeNull()
		expect(result?.mu).toBeCloseTo(2)
	})
})

describe('lognormalCdf', () => {
	it('returns 0 for x <= 0', () => {
		expect(lognormalCdf(0, 1, 0.5)).toBe(0)
		expect(lognormalCdf(-1, 1, 0.5)).toBe(0)
	})

	it('returns ~0.5 at the median (exp(mu))', () => {
		const mu = 1
		const sigma = 0.5
		const median = Math.exp(mu)
		expect(lognormalCdf(median, mu, sigma)).toBeCloseTo(0.5, 2)
	})

	it('approaches 1 for large x', () => {
		expect(lognormalCdf(1000, 1, 0.5)).toBeCloseTo(1, 4)
	})

	it('is monotonically increasing', () => {
		const mu = 1
		const sigma = 0.5
		const prev = lognormalCdf(1, mu, sigma)
		const next = lognormalCdf(2, mu, sigma)
		expect(next).toBeGreaterThan(prev)
	})
})

describe('lognormalQuantile', () => {
	it('returns 0 for p=0', () => {
		expect(lognormalQuantile(0, 1, 0.5)).toBe(0)
	})

	it('returns Infinity for p=1', () => {
		expect(lognormalQuantile(1, 1, 0.5)).toBe(Number.POSITIVE_INFINITY)
	})

	it('returns the median at p=0.5', () => {
		const mu = 1
		const sigma = 0.5
		const median = Math.exp(mu)
		expect(lognormalQuantile(0.5, mu, sigma)).toBeCloseTo(median, 1)
	})

	it('is the inverse of lognormalCdf', () => {
		const mu = 1.5
		const sigma = 0.8
		const x = 5
		const p = lognormalCdf(x, mu, sigma)
		expect(lognormalQuantile(p, mu, sigma)).toBeCloseTo(x, 1)
	})

	it('P10 < P50 < P90', () => {
		const mu = 1
		const sigma = 0.5
		const p10 = lognormalQuantile(0.1, mu, sigma)
		const p50 = lognormalQuantile(0.5, mu, sigma)
		const p90 = lognormalQuantile(0.9, mu, sigma)
		expect(p10).toBeLessThan(p50)
		expect(p50).toBeLessThan(p90)
	})
})

describe('snapVerdict', () => {
	describe('points (fibonacci)', () => {
		it('snaps to exact fibonacci values', () => {
			expect(snapVerdict(1, 'points')).toBe('1')
			expect(snapVerdict(5, 'points')).toBe('5')
			expect(snapVerdict(13, 'points')).toBe('13')
		})

		it('snaps to nearest fibonacci', () => {
			expect(snapVerdict(4, 'points')).toBe('3') // equidistant from 3 and 5, picks lower
			expect(snapVerdict(4.5, 'points')).toBe('5')
			expect(snapVerdict(6, 'points')).toBe('5')
			expect(snapVerdict(9, 'points')).toBe('8')
			expect(snapVerdict(11, 'points')).toBe('13')
			expect(snapVerdict(18, 'points')).toBe('21')
		})

		it('clamps small values to 1', () => {
			expect(snapVerdict(0.3, 'points')).toBe('1')
		})
	})

	describe('days (natural units)', () => {
		it('uses half-day for very small', () => {
			expect(snapVerdict(0.5, 'days')).toBe('½ day')
		})

		it('uses days for small values', () => {
			expect(snapVerdict(1, 'days')).toBe('1 day')
			expect(snapVerdict(2, 'days')).toBe('2 days')
			expect(snapVerdict(3, 'days')).toBe('3 days')
		})

		it('uses weeks for medium values', () => {
			expect(snapVerdict(5, 'days')).toBe('1 week')
			expect(snapVerdict(10, 'days')).toBe('2 weeks')
			expect(snapVerdict(15, 'days')).toBe('3 weeks')
		})

		it('uses month for large values', () => {
			expect(snapVerdict(20, 'days')).toBe('1 month')
		})
	})
})
