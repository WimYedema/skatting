import { generateBlobPoints } from './lognormal'

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

/** Map sigma from canvas Y position: top = low sigma (certain), bottom = high sigma (uncertain) */
export function canvasYToSigma(
	canvasY: number,
	canvasHeight: number,
	sigmaRange: [number, number] = [0.2, 2.0],
): number {
	const [sigmaMin, sigmaMax] = sigmaRange
	const t = Math.max(0, Math.min(1, (canvasY - 40) / (canvasHeight - 80)))
	// Top → sigmaMin (certain), Bottom → sigmaMax (uncertain)
	return sigmaMin + t * (sigmaMax - sigmaMin)
}

/** Map sigma back to canvas Y position */
export function sigmaToCanvasY(
	sigma: number,
	canvasHeight: number,
	sigmaRange: [number, number] = [0.2, 2.0],
): number {
	const [sigmaMin, sigmaMax] = sigmaRange
	const t = (sigma - sigmaMin) / (sigmaMax - sigmaMin)
	return 40 + t * (canvasHeight - 80)
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

	// Find max y for scaling the blob height to fit within the drawable area
	const maxY = Math.max(...points.map((p) => p.y))
	if (maxY <= 0) return

	// Scale: blob peak takes up at most 80% of drawable height
	const yScale = (drawHeight * 0.8) / maxY

	// The baseline Y (bottom of the blob) corresponds to the sigma position
	const baselineY = sigmaToCanvasY(sigma, canvasHeight)

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
