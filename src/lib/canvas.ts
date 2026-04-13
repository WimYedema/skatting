import { generateBlobPoints, muFromMode } from './lognormal'

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
	xRange: [0, 20],
	blobArea: 2,
}

/** Map from math-space x to canvas pixel x */
export function mathToCanvasX(
	mathX: number,
	canvasWidth: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): number {
	const drawWidth = canvasWidth - config.padding * 2
	const [xMin, xMax] = config.xRange
	return config.padding + ((mathX - xMin) / (xMax - xMin)) * drawWidth
}

/** Map from canvas pixel x to math-space x */
export function canvasToMathX(
	canvasX: number,
	canvasWidth: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): number {
	const drawWidth = canvasWidth - config.padding * 2
	const [xMin, xMax] = config.xRange
	return xMin + ((canvasX - config.padding) / drawWidth) * (xMax - xMin)
}

/**
 * Compute the canvas Y position of the blob peak for a given mu and sigma.
 * This matches exactly how drawBlob renders the peak.
 */
export function peakCanvasY(
	mu: number,
	sigma: number,
	canvasHeight: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): number {
	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const yScale = drawHeight * 0.6
	const baselineY = canvasHeight - pad

	// Compute the scaled peak PDF value (matching generateBlobPoints scaling)
	const points = generateBlobPoints(mu, sigma, config.blobArea)
	const maxY = Math.max(...points.map((p) => p.y))
	return baselineY - maxY * yScale
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
	sigmaRange: [number, number] = [0.1, 2.5],
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

/** Draw axes with labels */
export function drawAxes(ctx: CanvasRenderingContext2D, width: number, height: number): void {
	const pad = DEFAULT_CONFIG.padding

	ctx.strokeStyle = '#666'
	ctx.lineWidth = 1
	ctx.font = '12px system-ui, sans-serif'
	ctx.fillStyle = '#666'
	ctx.textAlign = 'center'

	// X-axis line
	ctx.beginPath()
	ctx.moveTo(pad, height - pad)
	ctx.lineTo(width - pad, height - pad)
	ctx.stroke()

	// X-axis label
	ctx.fillText('← Small', pad + 40, height - 10)
	ctx.fillText('Effort', width / 2, height - 10)
	ctx.fillText('Large →', width - pad - 40, height - 10)

	// Y-axis label (rotated)
	ctx.save()
	ctx.translate(14, height / 2)
	ctx.rotate(-Math.PI / 2)
	ctx.textAlign = 'center'
	ctx.fillText('Certain ↑        ↓ Uncertain', 0, 0)
	ctx.restore()
}

/** Draw a single blob (log-normal PDF) on the canvas */
export function drawBlob(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	canvasWidth: number,
	canvasHeight: number,
	color: string,
	alpha = 0.4,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const points = generateBlobPoints(mu, sigma, config.blobArea)
	if (points.length === 0) return

	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2

	// Fixed yScale: maps math-space y to pixels.
	// Use a constant so that changing sigma visibly changes height.
	// A narrow blob (low sigma) will be tall; a wide blob (high sigma) will be short.
	const yScale = drawHeight * 0.6

	// Fixed baseline at the x-axis (bottom of drawable area)
	const baselineY = canvasHeight - pad

	ctx.save()
	ctx.globalAlpha = alpha
	ctx.fillStyle = color
	ctx.beginPath()

	// Start from the baseline at the left edge of the blob
	const firstCanvasX = mathToCanvasX(points[0].x, canvasWidth, config)
	ctx.moveTo(firstCanvasX, baselineY)

	// Draw the top of the blob (PDF curve, going upward from baseline)
	for (const point of points) {
		const cx = mathToCanvasX(point.x, canvasWidth, config)
		const cy = baselineY - point.y * yScale
		ctx.lineTo(cx, cy)
	}

	// Close back to baseline at the right edge
	const lastCanvasX = mathToCanvasX(points[points.length - 1].x, canvasWidth, config)
	ctx.lineTo(lastCanvasX, baselineY)
	ctx.closePath()
	ctx.fill()

	// Draw the outline
	ctx.globalAlpha = Math.min(alpha + 0.3, 1)
	ctx.strokeStyle = color
	ctx.lineWidth = 2
	ctx.beginPath()
	for (let i = 0; i < points.length; i++) {
		const cx = mathToCanvasX(points[i].x, canvasWidth, config)
		const cy = baselineY - points[i].y * yScale
		if (i === 0) ctx.moveTo(cx, cy)
		else ctx.lineTo(cx, cy)
	}
	ctx.stroke()

	ctx.restore()
}

/** Clear the canvas and draw the full scene */
export function drawScene(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	myEstimate: { mu: number; sigma: number },
	peerEstimates: Array<{ mu: number; sigma: number; color: string }>,
	revealed: boolean,
): void {
	ctx.clearRect(0, 0, width, height)
	drawAxes(ctx, width, height)

	// Always draw the user's own blob
	drawBlob(ctx, myEstimate.mu, myEstimate.sigma, width, height, '#3b82f6', 0.5)

	// Draw peer blobs only when revealed
	if (revealed) {
		for (const peer of peerEstimates) {
			drawBlob(ctx, peer.mu, peer.sigma, width, height, peer.color)
		}
	}
}
