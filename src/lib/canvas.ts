import { combineEstimates, generateBlobPoints, lognormalPdf, muFromMode } from './lognormal'

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Produces deterministic jitter so blobs don't wobble on every redraw.
 */
function seededRng(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Small random offset for sketchy lines. Deterministic per seed. */
function jitter(rng: () => number, amount = 1.5): number {
	return (rng() - 0.5) * 2 * amount
}

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
 * Uses analytical peak height of the PDF, scaled by the same area-normalization
 * that generateBlobPoints applies, avoiding the 200-point generation.
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

	// Analytical peak: PDF evaluated at the mode
	const mode = Math.exp(mu - sigma ** 2)
	const rawPeak = lognormalPdf(mode, mu, sigma)

	// Compute raw area over the same truncated range that generateBlobPoints uses
	const mean = Math.exp(mu + sigma ** 2 / 2)
	const variance = (Math.exp(sigma ** 2) - 1) * Math.exp(2 * mu + sigma ** 2)
	const xMax = mean + 4 * Math.sqrt(variance)
	const xMin = Math.max(mode * 0.01, 1e-6)
	const numPoints = 200
	const step = (xMax - xMin) / (numPoints - 1)

	let rawArea = 0
	let prevY = lognormalPdf(xMin, mu, sigma)
	for (let i = 1; i < numPoints; i++) {
		const x = xMin + i * step
		const y = lognormalPdf(x, mu, sigma)
		rawArea += ((prevY + y) / 2) * step
		prevY = y
	}

	const scale = rawArea > 0 ? config.blobArea / rawArea : 1
	const scaledPeak = rawPeak * scale

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
	sigmaRange: [number, number] = [0.01, 2.5],
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

/** Draw axes with labels — hand-drawn style */
export function drawAxes(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	unit: string = 'points',
): void {
	const pad = DEFAULT_CONFIG.padding
	const [, xMax] = DEFAULT_CONFIG.xRange
	const rng = seededRng(42)

	ctx.strokeStyle = '#5a5040'
	ctx.lineWidth = 1.5
	ctx.font = '16px Caveat, cursive'
	ctx.fillStyle = '#6a6050'
	ctx.textAlign = 'center'

	// Sketchy X-axis line — draw as short segments with jitter
	ctx.beginPath()
	const xSteps = 30
	for (let i = 0; i <= xSteps; i++) {
		const x = pad + ((width - pad * 2) / xSteps) * i
		const y = height - pad + jitter(rng, 1)
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x + jitter(rng, 0.5), y)
	}
	ctx.stroke()

	// X-axis numeric tick marks
	ctx.font = '14px Caveat, cursive'
	ctx.textAlign = 'center'
	const tickRng = seededRng(88)
	const tickStep = xMax <= 20 ? 2 : 5
	for (let v = tickStep; v < xMax; v += tickStep) {
		const tx = mathToCanvasX(v, width)
		const baseY = height - pad
		// Small tick line
		ctx.beginPath()
		ctx.moveTo(tx + jitter(tickRng, 0.5), baseY)
		ctx.lineTo(tx + jitter(tickRng, 0.5), baseY + 6)
		ctx.stroke()
		// Number label
		ctx.fillText(String(v), tx + jitter(tickRng, 0.8), baseY + 18)
	}

	// X-axis unit label
	ctx.font = '15px Caveat, cursive'
	ctx.fillText(unit, width / 2, height - 2)

	// Sketchy Y-axis line
	const yRng = seededRng(55)
	ctx.beginPath()
	const ySteps = 20
	for (let i = 0; i <= ySteps; i++) {
		const x = pad + jitter(yRng, 1)
		const y = pad + ((height - pad * 2) / ySteps) * i
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y + jitter(yRng, 0.5))
	}
	ctx.stroke()

	// Y-axis percentage labels
	ctx.font = '13px Caveat, cursive'
	ctx.textAlign = 'right'
	const percentRng = seededRng(77)
	for (const pct of [0, 25, 50, 75, 100]) {
		// 0% at baseline, 100% at top
		const py = height - pad - (pct / 100) * (height - pad * 2)
		// Tick
		ctx.beginPath()
		ctx.moveTo(pad, py + jitter(percentRng, 0.5))
		ctx.lineTo(pad - 5, py + jitter(percentRng, 0.5))
		ctx.stroke()
		// Label
		ctx.fillText(`${pct}%`, pad - 7, py + 4 + jitter(percentRng, 0.5))
	}

	// Y-axis title
	ctx.save()
	ctx.font = '15px Caveat, cursive'
	ctx.translate(12, height / 2)
	ctx.rotate(-Math.PI / 2)
	ctx.textAlign = 'center'
	ctx.fillText('certainty', 0, 0)
	ctx.restore()
}

/** Create a diagonal hatch pattern for a given color */
function createHatchPattern(
	ctx: CanvasRenderingContext2D,
	color: string,
	spacing = 4,
	lineWidth = 1,
): CanvasPattern | null {
	const size = spacing * 2
	const offscreen = new OffscreenCanvas(size, size)
	const octx = offscreen.getContext('2d')
	if (!octx) return null

	octx.strokeStyle = color
	octx.lineWidth = lineWidth
	// Draw diagonal lines (bottom-left to top-right), repeating at tile edges
	octx.beginPath()
	octx.moveTo(0, size)
	octx.lineTo(size, 0)
	octx.moveTo(-size / 2, size / 2)
	octx.lineTo(size / 2, -size / 2)
	octx.moveTo(size / 2, size + size / 2)
	octx.lineTo(size + size / 2, size / 2)
	octx.stroke()

	return ctx.createPattern(offscreen, 'repeat')
}

/** Draw a single blob (log-normal PDF) on the canvas — sketchy style */
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
	const yScale = drawHeight * 0.6
	const baselineY = canvasHeight - pad

	// Deterministic jitter seed from mu+sigma so each blob has stable wobble
	const seed = Math.round(mu * 1000) + Math.round(sigma * 7777)
	const rng = seededRng(seed)

	ctx.save()
	ctx.globalAlpha = alpha

	// Build the blob path
	const blobPath = new Path2D()
	const firstCanvasX = mathToCanvasX(points[0].x, canvasWidth, config)
	blobPath.moveTo(firstCanvasX, baselineY)

	for (const point of points) {
		const cx = mathToCanvasX(point.x, canvasWidth, config) + jitter(rng, 1.0)
		const cy = baselineY - point.y * yScale + jitter(rng, 1.0)
		blobPath.lineTo(cx, cy)
	}

	const lastCanvasX = mathToCanvasX(points[points.length - 1].x, canvasWidth, config)
	blobPath.lineTo(lastCanvasX, baselineY)
	blobPath.closePath()

	// Fill with diagonal hatch pattern
	const pattern = createHatchPattern(ctx, color)
	if (pattern) {
		ctx.fillStyle = pattern
	} else {
		ctx.fillStyle = color
	}
	ctx.fill(blobPath)

	// Sketchy outline — draw twice with slight offset for hand-drawn feel
	for (let pass = 0; pass < 2; pass++) {
		const outlineRng = seededRng(seed + pass * 999)
		ctx.globalAlpha = Math.min(alpha + 0.2, 0.8)
		ctx.strokeStyle = color
		ctx.lineWidth = pass === 0 ? 2 : 1.2
		ctx.beginPath()
		for (let i = 0; i < points.length; i++) {
			const cx = mathToCanvasX(points[i].x, canvasWidth, config) + jitter(outlineRng, 1.5)
			const cy = baselineY - points[i].y * yScale + jitter(outlineRng, 1.5)
			if (i === 0) ctx.moveTo(cx, cy)
			else ctx.lineTo(cx, cy)
		}
		ctx.stroke()
	}

	ctx.restore()
}

/** Draw the combined estimate — thick dashed sketchy outline, no fill */
function drawCombinedBlob(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	canvasWidth: number,
	canvasHeight: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const points = generateBlobPoints(mu, sigma, config.blobArea)
	if (points.length === 0) return

	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const yScale = drawHeight * 0.6
	const baselineY = canvasHeight - pad

	const seed = Math.round(mu * 1000) + Math.round(sigma * 3333)

	ctx.save()

	// Draw twice with jitter for sketchy hand-drawn feel
	for (let pass = 0; pass < 2; pass++) {
		const rng = seededRng(seed + pass * 777)
		ctx.strokeStyle = '#2a2520'
		ctx.lineWidth = pass === 0 ? 3 : 1.8
		ctx.setLineDash([8, 5])
		ctx.globalAlpha = pass === 0 ? 0.6 : 0.4
		ctx.beginPath()
		for (let i = 0; i < points.length; i++) {
			const cx = mathToCanvasX(points[i].x, canvasWidth, config) + jitter(rng, 1.5)
			const cy = baselineY - points[i].y * yScale + jitter(rng, 1.5)
			if (i === 0) ctx.moveTo(cx, cy)
			else ctx.lineTo(cx, cy)
		}
		ctx.stroke()
	}
	ctx.setLineDash([])

	// Label at peak
	const maxIdx = points.reduce((best, p, i) => (p.y > points[best].y ? i : best), 0)
	const peakX = mathToCanvasX(points[maxIdx].x, canvasWidth, config)
	const peakY = baselineY - points[maxIdx].y * yScale
	ctx.globalAlpha = 0.8
	ctx.font = '14px Caveat, cursive'
	ctx.fillStyle = '#2a2520'
	ctx.textAlign = 'center'
	ctx.fillText('Combined', peakX, peakY - 10)

	ctx.restore()
}

/** Draw a paper-like background with subtle colour noise */
function drawPaperBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
	// Warm off-white paper base
	ctx.fillStyle = '#f5f0e6'
	ctx.fillRect(0, 0, width, height)

	// Subtle grain for paper texture
	const rng = seededRng(123)
	const dotCount = Math.floor((width * height) / 250)
	for (let i = 0; i < dotCount; i++) {
		const x = rng() * width
		const y = rng() * height
		const shade = 180 + Math.floor(rng() * 40)
		const a = 0.04 + rng() * 0.06
		ctx.fillStyle = `rgba(${shade}, ${shade - 10}, ${shade - 20}, ${a})`
		ctx.fillRect(x, y, 2, 2)
	}

	// Lijntjespapier — horizontal ruled lines only
	const lineSpacing = 24
	ctx.strokeStyle = 'rgba(140, 180, 210, 0.3)'
	ctx.lineWidth = 0.5
	for (let y = lineSpacing; y < height; y += lineSpacing) {
		ctx.beginPath()
		ctx.moveTo(0, y)
		ctx.lineTo(width, y)
		ctx.stroke()
	}

	// Left margin line (red, like real lijntjespapier)
	const marginX = 36
	ctx.strokeStyle = 'rgba(200, 120, 120, 0.3)'
	ctx.lineWidth = 0.8
	ctx.beginPath()
	ctx.moveTo(marginX, 0)
	ctx.lineTo(marginX, height)
	ctx.stroke()
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
	const points = generateBlobPoints(mu, sigma, config.blobArea)
	if (points.length === 0) return false

	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const yScale = drawHeight * 0.6
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

/** Draw scribbled labels for past estimates at their combined position */
function drawHistoryScribbles(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	history: Array<{ label: string; mu: number; sigma: number }>,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const pad = config.padding
	const drawHeight = height - pad * 2
	const yScale = drawHeight * 0.6
	const baselineY = height - pad

	for (let i = 0; i < history.length; i++) {
		const entry = history[i]
		const points = generateBlobPoints(entry.mu, entry.sigma, config.blobArea)
		if (points.length === 0) continue

		// Find peak position
		const maxIdx = points.reduce((best, p, idx) => (p.y > points[best].y ? idx : best), 0)
		const peakX = mathToCanvasX(points[maxIdx].x, width, config)
		const peakY = baselineY - points[maxIdx].y * yScale

		// Seeded rotation for slight tilt
		const rng = seededRng(i * 4321 + entry.label.length)
		const rotation = (rng() - 0.5) * 0.15 // ±~4 degrees

		ctx.save()
		ctx.translate(peakX, peakY)
		ctx.rotate(rotation)
		ctx.globalAlpha = 0.5
		ctx.font = '13px Caveat, cursive'
		ctx.fillStyle = '#5a5040'
		ctx.textAlign = 'center'
		ctx.fillText(entry.label, 0, -4)

		// Small × mark at the exact point
		ctx.strokeStyle = '#5a5040'
		ctx.lineWidth = 1.2
		ctx.beginPath()
		ctx.moveTo(-3, -3)
		ctx.lineTo(3, 3)
		ctx.moveTo(3, -3)
		ctx.lineTo(-3, 3)
		ctx.stroke()

		ctx.restore()
	}
}

/** Clear the canvas and draw the full scene */
export function drawScene(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	myEstimate: { mu: number; sigma: number },
	peerEstimates: Array<{ mu: number; sigma: number; color: string }>,
	revealed: boolean,
	history: Array<{ label: string; mu: number; sigma: number }> = [],
	unit: string = 'points',
): void {
	ctx.clearRect(0, 0, width, height)

	// Paper background with subtle noise
	drawPaperBackground(ctx, width, height)

	// Draw scribbled history labels before axes so they feel like underlayer
	if (history.length > 0) {
		drawHistoryScribbles(ctx, width, height, history)
	}

	drawAxes(ctx, width, height, unit)

	// Vertical dashed line at the user's current mode (peak) position
	const mode = Math.exp(myEstimate.mu - myEstimate.sigma ** 2)
	const modeCx = mathToCanvasX(mode, width)
	ctx.save()
	ctx.strokeStyle = 'rgba(91, 123, 154, 0.4)'
	ctx.lineWidth = 1.5
	ctx.setLineDash([6, 6])
	ctx.beginPath()
	ctx.moveTo(modeCx + 0.5, DEFAULT_CONFIG.padding)
	ctx.lineTo(modeCx - 0.5, height - DEFAULT_CONFIG.padding)
	ctx.stroke()
	ctx.setLineDash([])
	ctx.restore()

	// Always draw the user's own blob
	drawBlob(ctx, myEstimate.mu, myEstimate.sigma, width, height, '#5b7b9a', 0.5)

	// Draw peer blobs only when revealed
	if (revealed) {
		for (const peer of peerEstimates) {
			drawBlob(ctx, peer.mu, peer.sigma, width, height, peer.color)
		}

		// Draw combined estimate from all participants
		const allEstimates = [
			{ mu: myEstimate.mu, sigma: myEstimate.sigma },
			...peerEstimates.map((p) => ({ mu: p.mu, sigma: p.sigma })),
		]
		const combined = combineEstimates(allEstimates)
		if (combined) {
			drawCombinedBlob(ctx, combined.mu, combined.sigma, width, height)
		}
	}
}
