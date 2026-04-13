import { describe, expect, it } from 'vitest'
import {
	canvasToMathX,
	canvasYToSigmaFromPeak,
	DEFAULT_CONFIG,
	hitTestBlob,
	mathToCanvasX,
	peakCanvasY,
} from './canvas'
import { muFromMode } from './lognormal'

describe('mathToCanvasX / canvasToMathX', () => {
	const width = 800

	it('maps xRange[0] to left padding', () => {
		expect(mathToCanvasX(0, width)).toBe(DEFAULT_CONFIG.padding)
	})

	it('maps xRange[1] to right edge minus padding', () => {
		expect(mathToCanvasX(20, width)).toBe(width - DEFAULT_CONFIG.padding)
	})

	it('round-trips: canvasToMathX(mathToCanvasX(x)) ≈ x', () => {
		for (const x of [0, 5, 10, 15, 20]) {
			const canvasX = mathToCanvasX(x, width)
			expect(canvasToMathX(canvasX, width)).toBeCloseTo(x)
		}
	})

	it('is linear', () => {
		const x5 = mathToCanvasX(5, width)
		const x10 = mathToCanvasX(10, width)
		const x15 = mathToCanvasX(15, width)
		expect(x10 - x5).toBeCloseTo(x15 - x10)
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
		expect(sigma).toBe(0.01)
	})

	it('peak reaches the target cursorY', () => {
		const targetY = 200
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
