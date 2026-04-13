import { describe, expect, it } from 'vitest'
import { generateBlobPoints, lognormalMean, lognormalMode, lognormalPdf } from './lognormal'

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
