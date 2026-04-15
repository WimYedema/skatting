import { muFromMode } from './lognormal'

export interface CanvasConfig {
	/** Padding in pixels around the drawable area */
	padding: number
	/** X-axis range in math space [min, max] */
	xRange: [number, number]
	/** Fixed visual area for each blob (in math-space units²) */
	blobArea: number
}

export const DEFAULT_CONFIG: CanvasConfig = {
	padding: 40,
	xRange: [0.5, 55],
	blobArea: 0.55,
}

/** Map from math-space x to canvas pixel x */
export function mathToCanvasX(
	mathX: number,
	canvasWidth: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): number {
	const drawWidth = canvasWidth - config.padding * 2
	const [xMin, xMax] = config.xRange
	const logMin = Math.log(xMin)
	const logMax = Math.log(xMax)
	const logX = Math.log(Math.max(mathX, 1e-6))
	return config.padding + ((logX - logMin) / (logMax - logMin)) * drawWidth
}

/** Map from canvas pixel x to math-space x */
export function canvasToMathX(
	canvasX: number,
	canvasWidth: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): number {
	const drawWidth = canvasWidth - config.padding * 2
	const [xMin, xMax] = config.xRange
	const logMin = Math.log(xMin)
	const logMax = Math.log(xMax)
	const frac = (canvasX - config.padding) / drawWidth
	return Math.exp(logMin + frac * (logMax - logMin))
}

/**
 * Compute yScale so the tallest blob point doesn't exceed the drawable area.
 * Prefers drawHeight * 0.6 but caps to drawHeight * 0.95 / maxY if needed.
 */
export function computeYScale(drawHeight: number, maxY: number): number {
	const preferred = drawHeight * 0.6
	const maxAllowed = drawHeight * 0.98
	if (maxY * preferred <= maxAllowed) return preferred
	return maxAllowed / maxY
}

/**
 * Compute the canvas Y position of the blob peak for a given mu and sigma.
 * In log-space the lognormal is a normal N(mu, sigma²), so peak height depends
 * only on sigma: blobArea / (sigma * sqrt(2pi)). Independent of mu (mode).
 */
export function peakCanvasY(
	_mu: number,
	sigma: number,
	canvasHeight: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): number {
	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const baselineY = canvasHeight - pad

	const scaledPeak = config.blobArea / (sigma * Math.sqrt(2 * Math.PI))
	const yScale = computeYScale(drawHeight, scaledPeak)
	return baselineY - scaledPeak * yScale
}

/**
 * Find the sigma that makes the blob peak reach the given canvas Y position.
 * Uses binary search since peak height is monotonically decreasing with sigma.
 * Higher cursor → higher sigma (less certain, shorter peak).
 */
export function canvasYToSigmaFromPeak(
	canvasY: number,
	canvasHeight: number,
	desiredMode: number,
	sigmaRange: [number, number] = [0.08, 2.5],
	config: CanvasConfig = DEFAULT_CONFIG,
): number {
	const pad = config.padding
	const baselineY = canvasHeight - pad

	// Clamp: cursor at or below baseline → max sigma; cursor at top → min sigma
	if (canvasY >= baselineY - 2) return sigmaRange[1]
	if (canvasY <= pad) return sigmaRange[0]

	let lo = sigmaRange[0]
	let hi = sigmaRange[1]

	// Binary search: lower sigma → taller peak (lower canvasY)
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2
		const mu = muFromMode(desiredMode, mid)
		const peakY = peakCanvasY(mu, mid, canvasHeight, config)
		if (peakY < canvasY) {
			// Peak is too high (too tall), need more sigma
			lo = mid
		} else {
			// Peak is too low (too short), need less sigma
			hi = mid
		}
	}
	return (lo + hi) / 2
}

/**
 * Generate blob points in log-space where the lognormal becomes a normal distribution.
 * Returns {x, y} with x in linear math-space and y = normal PDF in log-space,
 * scaled so visual area in log-space equals targetArea.
 */
export function generateLogSpaceBlob(
	mu: number,
	sigma: number,
	targetArea: number,
	numPoints = 200,
	config: CanvasConfig = DEFAULT_CONFIG,
): Array<{ x: number; y: number }> {
	const uMin = Math.max(mu - 4 * sigma, Math.log(config.xRange[0]))
	const uMax = Math.min(mu + 4 * sigma, Math.log(config.xRange[1]))
	const step = (uMax - uMin) / (numPoints - 1)

	const rawPoints: Array<{ x: number; y: number }> = []
	let rawArea = 0

	for (let i = 0; i < numPoints; i++) {
		const u = uMin + i * step
		const y = Math.exp(-((u - mu) ** 2) / (2 * sigma ** 2)) / (sigma * Math.sqrt(2 * Math.PI))
		rawPoints.push({ x: Math.exp(u), y })
		if (i > 0) {
			rawArea += ((rawPoints[i - 1].y + y) / 2) * step
		}
	}

	const scale = rawArea > 0 ? targetArea / rawArea : 1
	return rawPoints.map((p) => ({ x: p.x, y: p.y * scale }))
}

/** Test if a canvas point (px, py) is inside a blob's filled area */
export function hitTestBlob(
	mu: number,
	sigma: number,
	px: number,
	py: number,
	canvasWidth: number,
	canvasHeight: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): boolean {
	const points = generateLogSpaceBlob(mu, sigma, config.blobArea, 200, config)
	if (points.length === 0) return false

	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const maxY = Math.max(...points.map((p) => p.y))
	const yScale = computeYScale(drawHeight, maxY)
	const baselineY = canvasHeight - pad

	// Quick Y check: must be between peak and baseline
	if (py > baselineY || py < pad) return false

	// Find the two points bracketing px, check if py is below the curve
	for (let i = 0; i < points.length - 1; i++) {
		const x0 = mathToCanvasX(points[i].x, canvasWidth, config)
		const x1 = mathToCanvasX(points[i + 1].x, canvasWidth, config)
		if (px >= x0 && px <= x1) {
			const t = (px - x0) / (x1 - x0)
			const curveY0 = baselineY - points[i].y * yScale
			const curveY1 = baselineY - points[i + 1].y * yScale
			const curveY = curveY0 + t * (curveY1 - curveY0)
			return py >= curveY && py <= baselineY
		}
	}
	return false
}
