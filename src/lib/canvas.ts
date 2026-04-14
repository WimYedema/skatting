import {
	combineEstimates,
	lognormalQuantile,
	muFromMode,
	snapVerdict,
} from './lognormal'
import type { SceneState } from './types'

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Produces deterministic jitter so blobs don't wobble on every redraw.
 */
/** @internal Seeded pseudo-random number generator (mulberry32). */
export function seededRng(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** @internal Small random offset for sketchy lines. Deterministic per seed. */
export function jitter(rng: () => number, amount = 1.5): number {
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
function computeYScale(drawHeight: number, maxY: number): number {
	const preferred = drawHeight * 0.6
	const maxAllowed = drawHeight * 0.98
	if (maxY * preferred <= maxAllowed) return preferred
	return maxAllowed / maxY
}

/**
 * Generate blob points in log-space where the lognormal becomes a normal distribution.
 * Returns {x, y} with x in linear math-space and y = normal PDF in log-space,
 * scaled so visual area in log-space equals targetArea.
 * Peak height = targetArea / (sigma * sqrt(2pi)) — independent of mu (mode),
 * giving uniform blob shapes across the entire X axis.
 */
function generateLogSpaceBlob(
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

/**
 * Compute the canvas Y position of the blob peak for a given mu and sigma.
 * In log-space the lognormal is a normal N(mu, sigma²), so peak height depends
 * only on sigma: blobArea / (sigma * sqrt(2pi)). Independent of mu (mode).
 */
export function peakCanvasY(
	mu: number,
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

/** Draw axes with labels — hand-drawn style */
export function drawAxes(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	unit: string = 'points',
): void {
	const pad = DEFAULT_CONFIG.padding
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

	// X-axis tick marks — log-spaced at natural estimation values
	ctx.font = '14px Caveat, cursive'
	ctx.textAlign = 'center'
	const tickRng = seededRng(88)
	const tickValues = [1, 2, 3, 5, 8, 13, 21, 34]
	for (const v of tickValues) {
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

	// Y-axis certainty labels — overlapping the axis in a soft pencil tone
	ctx.fillStyle = '#b8b0a0'
	const certaintyLabels: Array<{ frac: number; text: string }> = [
		{ frac: 0.02, text: "don't ask me…" },
		{ frac: 0.33, text: 'gut feeling' },
		{ frac: 0.66, text: 'pretty sure' },
		{ frac: 0.98, text: 'I know this!' },
	]
	const percentRng = seededRng(77)
	for (const { frac, text } of certaintyLabels) {
		const py = height - pad - frac * (height - pad * 2)
		ctx.save()
		ctx.font = '14px Caveat, cursive'
		ctx.translate(pad + 6, py + 4)
		ctx.rotate(-0.08 + jitter(percentRng, 0.03))
		ctx.textAlign = 'left'
		ctx.fillText(text, 0, 0)
		ctx.restore()
	}

	// Y-axis title
	ctx.save()
	ctx.font = '15px Caveat, cursive'
	ctx.fillStyle = '#6a6050'
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
	const points = generateLogSpaceBlob(mu, sigma, config.blobArea, 200, config)
	if (points.length === 0) return

	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const maxY = Math.max(...points.map((p) => p.y))
	const yScale = computeYScale(drawHeight, maxY)
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
	const points = generateLogSpaceBlob(mu, sigma, config.blobArea, 200, config)
	if (points.length === 0) return

	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const maxY = Math.max(...points.map((p) => p.y))
	const yScale = computeYScale(drawHeight, maxY)
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

/** Ticket info drawn on the paper like handwritten sketchbook notes */
function drawTicketInfo(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	ticket: { id: string; title: string; labels?: string[]; assignee?: string; description?: string },
): void {
	const rng = seededRng(ticket.id.length * 7 + ticket.title.length)

	// Rule of thirds intersections — rounded to avoid sub-pixel jitter on resize
	const leftThird = Math.round(width / 3)
	const rightThird = Math.round((width * 2) / 3)
	const topThird = Math.round(height / 3)

	// Anchor ticket ID + title near the upper-left third intersection
	const idX = Math.round(leftThird * 0.35)
	const idY = Math.round(topThird * 0.45)

	ctx.save()

	// Ticket ID (bold, slightly tilted)
	const idRotation = (rng() - 0.5) * 0.03 // ±~1°
	ctx.save()
	ctx.translate(idX, idY)
	ctx.rotate(idRotation)
	ctx.globalAlpha = 0.6
	ctx.font = 'bold 18px Caveat, cursive'
	ctx.fillStyle = '#1a3a6a'
	ctx.textAlign = 'left'
	ctx.fillText(ticket.id, 0, 0)
	ctx.restore()

	// Title below the ID
	const titleRotation = (rng() - 0.5) * 0.02
	const maxTitleWidth = Math.round(Math.min(rightThird - idX, width * 0.5))
	ctx.save()
	ctx.translate(idX, idY + 26)
	ctx.rotate(titleRotation)
	ctx.globalAlpha = 0.5
	ctx.font = '20px Caveat, cursive'
	ctx.fillStyle = '#1a3a6a'
	ctx.textAlign = 'left'

	let displayTitle = ticket.title
	while (ctx.measureText(displayTitle).width > maxTitleWidth && displayTitle.length > 10) {
		displayTitle = `${displayTitle.slice(0, -4)}…`
	}
	ctx.fillText(displayTitle, 0, 0)
	ctx.restore()

	// Labels + assignee near the upper-right third intersection
	const tagsX = Math.round(rightThird + (width - rightThird) * 0.5)
	let tagY = idY - 8

	if (ticket.labels && ticket.labels.length > 0) {
		ctx.globalAlpha = 0.4
		ctx.font = '14px Caveat, cursive'
		ctx.textAlign = 'right'

		for (const label of ticket.labels.slice(0, 4)) {
			const textWidth = ctx.measureText(label).width
			const tagPad = 5
			const tagW = textWidth + tagPad * 2
			const tagH = 18

			// Tag background
			ctx.fillStyle = 'rgba(26, 58, 106, 0.08)'
			ctx.beginPath()
			ctx.roundRect(tagsX - tagW, tagY - 12, tagW, tagH, 3)
			ctx.fill()

			// Tag text
			ctx.fillStyle = '#1a3a6a'
			ctx.fillText(label, tagsX - tagPad, tagY)
			tagY += 22
		}
	}

	if (ticket.assignee) {
		ctx.globalAlpha = 0.4
		ctx.font = '15px Caveat, cursive'
		ctx.textAlign = 'right'
		ctx.fillStyle = '#1a3a6a'
		ctx.fillText(`→ ${ticket.assignee}`, tagsX, tagY)
	}

	ctx.restore()
}

/** Draw scribbled labels for past estimates at their combined position */
function drawHistoryScribbles(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	history: Array<{ label: string; mu: number; sigma: number }>,
	persistentHistory: Array<{ label: string; mu: number; sigma: number }> = [],
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const pad = config.padding
	const drawHeight = height - pad * 2
	const baselineY = height - pad

	// Draw persistent history first (faded, smaller)
	const currentLabels = new Set(history.map((h) => h.label))
	// Sample up to 10 entries with spatial diversity
	const persistent = persistentHistory.filter((h) => !currentLabels.has(h.label)).slice(-10)

	for (let i = 0; i < persistent.length; i++) {
		const entry = persistent[i]
		const points = generateLogSpaceBlob(entry.mu, entry.sigma, config.blobArea, 200, config)
		if (points.length === 0) continue
		const maxIdx = points.reduce((best, p, idx) => (p.y > points[best].y ? idx : best), 0)
		const entryYScale = computeYScale(drawHeight, points[maxIdx].y)
		const peakX = mathToCanvasX(points[maxIdx].x, width, config)
		const peakY = baselineY - points[maxIdx].y * entryYScale

		const rng = seededRng(i * 7777 + entry.label.length)
		const rotation = (rng() - 0.5) * 0.15

		ctx.save()
		ctx.translate(peakX, peakY)
		ctx.rotate(rotation)
		ctx.globalAlpha = 0.5
		ctx.font = '13px Caveat, cursive'
		ctx.fillStyle = '#5a5040'
		ctx.textAlign = 'center'
		ctx.fillText(entry.label, 0, -4)

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

	// Draw current-session history
	for (let i = 0; i < history.length; i++) {
		const entry = history[i]
		const points = generateLogSpaceBlob(entry.mu, entry.sigma, config.blobArea, 200, config)
		if (points.length === 0) continue

		// Find peak position
		const maxIdx = points.reduce((best, p, idx) => (p.y > points[best].y ? idx : best), 0)
		const entryYScale = computeYScale(drawHeight, points[maxIdx].y)
		const peakX = mathToCanvasX(points[maxIdx].x, width, config)
		const peakY = baselineY - points[maxIdx].y * entryYScale

		// Seeded rotation for slight tilt
		const rng = seededRng(i * 4321 + entry.label.length)
		const rotation = (rng() - 0.5) * 0.15 // ±~4 degrees

		ctx.save()
		ctx.translate(peakX, peakY)
		ctx.rotate(rotation)
		ctx.globalAlpha = 0.75
		ctx.font = '15px Caveat, cursive'
		ctx.fillStyle = '#2a1f10'
		ctx.textAlign = 'center'
		ctx.fillText(entry.label, 0, -5)

		// Small × mark at the exact point
		ctx.strokeStyle = '#2a1f10'
		ctx.lineWidth = 1.5
		ctx.beginPath()
		ctx.moveTo(-3, -3)
		ctx.lineTo(3, 3)
		ctx.moveTo(3, -3)
		ctx.lineTo(-3, 3)
		ctx.stroke()

		ctx.restore()
	}
}

/**
 * Draw a sketchy curvy arrow from (x0,y0) to (x1,y1).
 * The arrow curves via a control point offset from the midpoint.
 */
/**
 * Draw an elastic-looking arrow from (x0,y0) to (x1,y1).
 * Single cubic bezier whose bow increases with distance —
 * short = nearly straight, long = stretched rubber-band curve.
 * Fully deterministic, no RNG.
 */
function drawSketchyArrow(
	ctx: CanvasRenderingContext2D,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): void {
	const dx = x1 - x0
	const dy = y1 - y0
	const len = Math.sqrt(dx * dx + dy * dy)
	if (len < 5) return

	const perpX = -dy / len
	const perpY = dx / len

	// Bow grows quadratically with length — elastic rubber-band feel
	const bow = Math.min(len * len * 0.0008, 30)

	// Asymmetric S-curve: first CP bows out more, second less
	const cp1x = x0 + dx * 0.3 + perpX * bow
	const cp1y = y0 + dy * 0.3 + perpY * bow
	const cp2x = x0 + dx * 0.7 - perpX * bow * 0.3
	const cp2y = y0 + dy * 0.7 - perpY * bow * 0.3

	ctx.beginPath()
	ctx.moveTo(x0, y0)
	ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, y1)
	ctx.stroke()

	// Arrowhead from tangent at t=1: derivative = 3*(P3-P2)
	const angle = Math.atan2(y1 - cp2y, x1 - cp2x)
	const headLen = 7
	ctx.beginPath()
	ctx.moveTo(x1, y1)
	ctx.lineTo(x1 - headLen * Math.cos(angle - 0.4), y1 - headLen * Math.sin(angle - 0.4))
	ctx.moveTo(x1, y1)
	ctx.lineTo(x1 - headLen * Math.cos(angle + 0.4), y1 - headLen * Math.sin(angle + 0.4))
	ctx.stroke()
}

/** Format a number nicely: show 1 decimal if < 10, otherwise integer */
function formatValue(v: number): string {
	if (v < 10) return v.toFixed(1)
	return Math.round(v).toString()
}

/**
 * Draw annotations near the blob with an elastic-drag feel.
 * Note labels are anchored toward the chart center and only partially
 * follow the blob — so the arrow stretches and bows when you drag far.
 */
function drawAnnotations(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	width: number,
	height: number,
	unit: string,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const pad = config.padding

	const median = lognormalQuantile(0.5, mu, sigma)
	const p10 = lognormalQuantile(0.1, mu, sigma)
	const p90 = lognormalQuantile(0.9, mu, sigma)

	const medianCx = Math.max(pad, Math.min(mathToCanvasX(median, width, config), width - pad))
	const p10Cx = Math.max(mathToCanvasX(p10, width, config), pad)
	const p90Cx = Math.min(mathToCanvasX(p90, width, config), width - pad)

	// Abort if median is off-screen
	if (medianCx < pad || medianCx > width - pad) return

	const blobPeakY = peakCanvasY(mu, sigma, height, config)
	const noteAnchorY = Math.max(blobPeakY, pad + 40)

	// "Rest" position: center of the drawable area.
	// Notes lerp only partway toward the blob → they lag behind.
	const restX = width / 2
	const drag = 0.35 // 0 = pinned to center, 1 = tracks blob exactly
	const noteY = noteAnchorY - 55
	const spreadX = 55 // horizontal offset so annotations sit side-by-side

	ctx.save()
	ctx.globalAlpha = 0.75
	ctx.strokeStyle = '#1a6b5a'
	ctx.lineWidth = 1.0

	// -- Median annotation (left, slightly lower) --
	const medianText = `~${formatValue(median)} ${unit}`
	const medianNoteX = restX + (medianCx - restX) * drag - spreadX
	const medianNoteY = noteY + 8

	ctx.font = '18px Caveat, cursive'
	ctx.fillStyle = '#1a6b5a'
	ctx.textAlign = 'center'
	ctx.fillText(medianText, medianNoteX, medianNoteY)
	ctx.font = '13px Caveat, cursive'
	ctx.fillStyle = '#3a8b7a'
	ctx.fillText('most likely', medianNoteX, medianNoteY + 16)

	// Arrow from note to peak — stretches and bows the further apart they are
	drawSketchyArrow(ctx, medianNoteX, medianNoteY + 19, medianCx, noteAnchorY - 2)

	// -- Range annotation (right, side-by-side with median) --
	const rangeText = `${formatValue(p10)}–${formatValue(p90)} ${unit}`
	const rangeMidX = (medianCx + p90Cx) / 2
	const rangeNoteX = restX + (rangeMidX - restX) * drag + spreadX
	const clampedRangeNoteX = Math.min(Math.max(rangeNoteX, pad + 80), width - pad - 60)
	const rangeNoteY = noteY

	ctx.font = '16px Caveat, cursive'
	ctx.fillStyle = '#1a6b5a'
	ctx.textAlign = 'center'
	ctx.fillText(rangeText, clampedRangeNoteX, rangeNoteY)
	ctx.font = '12px Caveat, cursive'
	ctx.fillStyle = '#3a8b7a'
	ctx.fillText('80% falls here', clampedRangeNoteX, rangeNoteY + 14)

	// Arrows to P10 and P90 — long stretch = big bow
	const curveTargetY = noteAnchorY + (height - pad - noteAnchorY) * 0.4
	drawSketchyArrow(ctx, clampedRangeNoteX - 20, rangeNoteY + 17, p10Cx, curveTargetY)
	drawSketchyArrow(ctx, clampedRangeNoteX + 20, rangeNoteY + 17, p90Cx, curveTargetY)

	// -- Vertical dashed lines at P10 and P90 range limits --
	const baselineY = height - pad
	const rangeLineTop = noteAnchorY - (baselineY - noteAnchorY) * 0.1
	const rangeLineBottom = baselineY - 2
	ctx.globalAlpha = 0.55
	ctx.strokeStyle = '#5a5040'
	ctx.lineWidth = 1.2
	ctx.setLineDash([4, 5])
	ctx.beginPath()
	ctx.moveTo(p10Cx, rangeLineTop)
	ctx.lineTo(p10Cx, rangeLineBottom)
	ctx.moveTo(p90Cx, rangeLineTop)
	ctx.lineTo(p90Cx, rangeLineBottom)
	ctx.stroke()
	ctx.setLineDash([])

	ctx.restore()
}

/**
 * Draw a prominent verdict label below the combined blob.
 * Shows the snapped value (Fibonacci for points, natural units for days).
 */
function drawVerdict(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	width: number,
	height: number,
	unit: string,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const pad = config.padding
	const median = lognormalQuantile(0.5, mu, sigma)
	const verdict = snapVerdict(median, unit)

	const baselineY = height - pad
	const chartHeight = baselineY - pad
	const chartWidth = width - pad * 2

	// Default position: top-right third intersection
	let labelX = pad + chartWidth * (2 / 3)
	let labelY = pad + chartHeight * (1 / 3)

	// Check if the blob peak is too close — if so, move the label
	const blobPeakX = mathToCanvasX(Math.exp(mu - sigma ** 2), width, config)
	const blobPeakY = peakCanvasY(mu, sigma, height, config)
	const dx = Math.abs(labelX - blobPeakX)
	const dy = Math.abs(labelY - blobPeakY)

	if (dx < 120 && dy < 60) {
		// Move to top-left third instead
		labelX = pad + chartWidth * (1 / 3)
		labelY = pad + chartHeight * (1 / 4)
		// If that also overlaps, push further up
		if (Math.abs(labelX - blobPeakX) < 120 && Math.abs(labelY - blobPeakY) < 60) {
			labelX = pad + chartWidth * (1 / 5)
			labelY = pad + chartHeight * (1 / 6)
		}
	}

	ctx.save()
	ctx.font = '22px Caveat, cursive'
	ctx.fillStyle = '#2a2520'
	ctx.globalAlpha = 0.8
	ctx.textAlign = 'right'
	ctx.fillText(`call it ${verdict}`, labelX, labelY)

	if (unit === 'points') {
		ctx.font = '12px Caveat, cursive'
		ctx.fillStyle = '#7a7060'
		ctx.globalAlpha = 0.6
		ctx.fillText('(fibonacci)', labelX, labelY + 15)
	}

	ctx.restore()
}

/** Clear the canvas and draw the full scene */
export function drawScene(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	scene: SceneState,
): void {
	const { myEstimate, peerEstimates, revealed, history, unit, currentTicket, persistentHistory } =
		scene

	ctx.clearRect(0, 0, width, height)

	// Paper background with subtle noise
	drawPaperBackground(ctx, width, height)

	// Ticket info on the paper (sketchbook notes)
	if (currentTicket) {
		drawTicketInfo(ctx, width, height, currentTicket)
	}

	// Draw scribbled history labels before axes so they feel like underlayer
	if (history.length > 0 || persistentHistory.length > 0) {
		drawHistoryScribbles(ctx, width, height, history, persistentHistory)
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

	// Annotations: show on own blob pre-reveal, on combined blob post-reveal
	if (!revealed) {
		drawAnnotations(ctx, myEstimate.mu, myEstimate.sigma, width, height, unit)
	}

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
			drawAnnotations(ctx, combined.mu, combined.sigma, width, height, unit)
			drawVerdict(ctx, combined.mu, combined.sigma, width, height, unit)
		}
	}
}
