import {
	type CanvasConfig,
	canvasToMathX,
	canvasYToSigmaFromPeak,
	computeYScale,
	DEFAULT_CONFIG,
	generateLogSpaceBlob,
	hitTestBlob,
	hitTestGrabHandle,
	mathToCanvasX,
	peakCanvasY,
} from './canvas-coords'
import {
	createHatchPattern,
	drawSketchyArrow,
	jitter,
	seededRng,
	sketchyEllipse,
} from './canvas-sketchy'
import {
	type BlobCluster,
	convergenceState,
	detectClusters,
	detectPattern,
	lognormalOverlap,
} from './facilitation'
import {
	collectEstimates,
	combineEstimates,
	lognormalQuantile,
	muFromMode,
	snapVerdict,
} from './lognormal'
import type { SceneState } from './types'

// Re-export public API from sub-modules so existing imports keep working
export {
	type BlobCluster,
	type CanvasConfig,
	canvasToMathX,
	canvasYToSigmaFromPeak,
	convergenceState,
	DEFAULT_CONFIG,
	detectClusters,
	detectPattern,
	hitTestBlob,
	hitTestGrabHandle,
	jitter,
	lognormalOverlap,
	mathToCanvasX,
	peakCanvasY,
	seededRng,
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

/** Draw a ghost blob — dotted outline, no fill, "?" in center. Indicates an uncommitted estimate. */
function drawGhostBlob(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	canvasWidth: number,
	canvasHeight: number,
	color: string,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const points = generateLogSpaceBlob(mu, sigma, config.blobArea, 200, config)
	if (points.length === 0) return

	const pad = config.padding
	const drawHeight = canvasHeight - pad * 2
	const maxY = Math.max(...points.map((p) => p.y))
	const yScale = computeYScale(drawHeight, maxY)
	const baselineY = canvasHeight - pad

	const seed = Math.round(mu * 1000) + Math.round(sigma * 7777)
	const rng = seededRng(seed)

	ctx.save()

	// Dotted outline only — no fill
	ctx.globalAlpha = 0.35
	ctx.strokeStyle = color
	ctx.lineWidth = 2
	ctx.setLineDash([4, 6])
	ctx.beginPath()
	for (let i = 0; i < points.length; i++) {
		const cx = mathToCanvasX(points[i].x, canvasWidth, config) + jitter(rng, 1.0)
		const cy = baselineY - points[i].y * yScale + jitter(rng, 1.0)
		if (i === 0) ctx.moveTo(cx, cy)
		else ctx.lineTo(cx, cy)
	}
	ctx.stroke()
	ctx.setLineDash([])

	// Draw a "?" in the center of the blob
	const mode = Math.exp(mu - sigma ** 2)
	const centerX = mathToCanvasX(mode, canvasWidth, config)
	const peakY = baselineY - maxY * yScale
	const centerY = peakY + (baselineY - peakY) * 0.45
	const fontSize = Math.min(Math.max((baselineY - peakY) * 0.5, 20), 48)

	ctx.globalAlpha = 0.4
	ctx.font = `${fontSize}px 'Caveat', cursive`
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillStyle = color
	ctx.fillText('?', centerX, centerY)

	ctx.restore()
}

/** Draw a sketchy "Drag me!" arrow pointing at the ghost blob */
function drawDragMeArrow(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	canvasWidth: number,
	canvasHeight: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const mode = Math.exp(mu - sigma ** 2)
	const blobCenterX = mathToCanvasX(mode, canvasWidth, config)
	const pad = config.padding
	const baselineY = canvasHeight - pad

	// Arrow starts from the bottom-right area and curves toward the blob
	const startX = Math.min(blobCenterX + canvasWidth * 0.18, canvasWidth - pad - 20)
	const startY = baselineY - canvasHeight * 0.12
	const endX = blobCenterX + 15
	const endY = baselineY - canvasHeight * 0.3

	const seed = 42424242
	const rng = seededRng(seed)

	ctx.save()
	ctx.globalAlpha = 0.45
	ctx.strokeStyle = '#5b7b9a'
	ctx.lineWidth = 2

	// Draw a wobbly curved arrow
	ctx.beginPath()
	ctx.moveTo(startX + jitter(rng, 2), startY + jitter(rng, 2))
	const cpX = (startX + endX) / 2 + canvasWidth * 0.05
	const cpY = (startY + endY) / 2 - canvasHeight * 0.08
	ctx.quadraticCurveTo(
		cpX + jitter(rng, 3),
		cpY + jitter(rng, 3),
		endX + jitter(rng, 2),
		endY + jitter(rng, 2),
	)
	ctx.stroke()

	// Arrowhead
	const angle = Math.atan2(endY - cpY, endX - cpX)
	const headLen = 12
	ctx.beginPath()
	ctx.moveTo(endX, endY)
	ctx.lineTo(
		endX - headLen * Math.cos(angle - 0.4) + jitter(rng, 1),
		endY - headLen * Math.sin(angle - 0.4) + jitter(rng, 1),
	)
	ctx.moveTo(endX, endY)
	ctx.lineTo(
		endX - headLen * Math.cos(angle + 0.4) + jitter(rng, 1),
		endY - headLen * Math.sin(angle + 0.4) + jitter(rng, 1),
	)
	ctx.stroke()

	// "Drag me!" text at the arrow's tail
	const fontSize = Math.min(Math.max(canvasHeight * 0.04, 16), 24)
	ctx.font = `${fontSize}px 'Caveat', cursive`
	ctx.fillStyle = '#5b7b9a'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.globalAlpha = 0.5
	ctx.save()
	ctx.translate(startX, startY + fontSize * 0.8)
	ctx.rotate(0.05 + jitter(rng, 0.02))
	ctx.fillText('Drag me!', 0, 0)
	ctx.restore()

	ctx.restore()
}

/**
 * Draw a sketchy grab handle at the blob's peak — a small circle with
 * crosshair arrows (↔ effort, ↕ certainty) to indicate draggability.
 */
function drawGrabHandle(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	canvasWidth: number,
	canvasHeight: number,
	config: CanvasConfig = DEFAULT_CONFIG,
	hover = false,
	isDragging = false,
): void {
	const mode = Math.exp(mu - sigma ** 2)
	const cx = mathToCanvasX(mode, canvasWidth, config)
	const cy = peakCanvasY(mu, sigma, canvasHeight, config)

	const r = 8
	const armLen = hover ? 18 : 14
	const seed = Math.round(mu * 2000) + Math.round(sigma * 5555)
	const rng = seededRng(seed)
	const tipLen = hover ? 7 : 5

	ctx.save()
	ctx.globalAlpha = 0.55
	ctx.strokeStyle = '#7a6a5a'
	ctx.lineWidth = 1.8
	ctx.fillStyle = 'rgba(245, 240, 230, 0.7)'

	// Sketchy circle at the peak
	sketchyEllipse(ctx, cx, cy, r + jitter(rng, 1), r + jitter(rng, 1), rng, 1, 24)
	ctx.fill()
	ctx.stroke()

	// Arrows hidden while dragging — circle alone marks the position
	if (!isDragging) {
	// Left arm
	ctx.beginPath()
	ctx.moveTo(cx - r - 2 + jitter(rng, 0.5), cy + jitter(rng, 0.5))
	ctx.lineTo(cx - r - armLen + jitter(rng, 1), cy + jitter(rng, 1))
	ctx.stroke()
	// Left arrowhead
	ctx.beginPath()
	ctx.moveTo(cx - r - armLen, cy)
	ctx.lineTo(cx - r - armLen + tipLen + jitter(rng, 0.5), cy - tipLen + jitter(rng, 0.5))
	ctx.moveTo(cx - r - armLen, cy)
	ctx.lineTo(cx - r - armLen + tipLen + jitter(rng, 0.5), cy + tipLen + jitter(rng, 0.5))
	ctx.stroke()
	// Right arm
	ctx.beginPath()
	ctx.moveTo(cx + r + 2 + jitter(rng, 0.5), cy + jitter(rng, 0.5))
	ctx.lineTo(cx + r + armLen + jitter(rng, 1), cy + jitter(rng, 1))
	ctx.stroke()
	// Right arrowhead
	ctx.beginPath()
	ctx.moveTo(cx + r + armLen, cy)
	ctx.lineTo(cx + r + armLen - tipLen + jitter(rng, 0.5), cy - tipLen + jitter(rng, 0.5))
	ctx.moveTo(cx + r + armLen, cy)
	ctx.lineTo(cx + r + armLen - tipLen + jitter(rng, 0.5), cy + tipLen + jitter(rng, 0.5))
	ctx.stroke()

	// Vertical arrows (certainty ↕)
	// Up arm
	ctx.beginPath()
	ctx.moveTo(cx + jitter(rng, 0.5), cy - r - 2 + jitter(rng, 0.5))
	ctx.lineTo(cx + jitter(rng, 1), cy - r - armLen + jitter(rng, 1))
	ctx.stroke()
	// Up arrowhead
	ctx.beginPath()
	ctx.moveTo(cx, cy - r - armLen)
	ctx.lineTo(cx - tipLen + jitter(rng, 0.5), cy - r - armLen + tipLen + jitter(rng, 0.5))
	ctx.moveTo(cx, cy - r - armLen)
	ctx.lineTo(cx + tipLen + jitter(rng, 0.5), cy - r - armLen + tipLen + jitter(rng, 0.5))
	ctx.stroke()
	// Down arm
	ctx.beginPath()
	ctx.moveTo(cx + jitter(rng, 0.5), cy + r + 2 + jitter(rng, 0.5))
	ctx.lineTo(cx + jitter(rng, 1), cy + r + armLen + jitter(rng, 1))
	ctx.stroke()
	// Down arrowhead
	ctx.beginPath()
	ctx.moveTo(cx, cy + r + armLen)
	ctx.lineTo(cx - tipLen + jitter(rng, 0.5), cy + r + armLen - tipLen + jitter(rng, 0.5))
	ctx.moveTo(cx, cy + r + armLen)
	ctx.lineTo(cx + tipLen + jitter(rng, 0.5), cy + r + armLen - tipLen + jitter(rng, 0.5))
	ctx.stroke()
	} // end !isDragging

	ctx.restore()
}

/**
 * Draw a faint ghost marker at the original combined position —
 * a small dotted ring with "was here" label, so the facilitator can see
 * how far they've moved the conclusion from the group's math result.
 */
function drawCombinedGhost(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	canvasWidth: number,
	canvasHeight: number,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const mode = Math.exp(mu - sigma ** 2)
	const cx = mathToCanvasX(mode, canvasWidth, config)
	const cy = peakCanvasY(mu, sigma, canvasHeight, config)
	const seed = Math.round(mu * 1500) + Math.round(sigma * 4444)
	const rng = seededRng(seed)

	ctx.save()
	ctx.globalAlpha = 0.3
	ctx.strokeStyle = '#2a2520'
	ctx.lineWidth = 1.5
	ctx.setLineDash([3, 4])

	// Small wobbly ring
	const r = 6
	sketchyEllipse(ctx, cx, cy, r, r, rng, 0.8, 20)
	ctx.stroke()

	// "combined" label
	ctx.setLineDash([])
	ctx.font = '11px Caveat, cursive'
	ctx.fillStyle = '#2a2520'
	ctx.globalAlpha = 0.25
	ctx.textAlign = 'center'
	ctx.fillText('combined', cx, cy + r + 14)

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
 * Draw a sketchy lasso (wobbly dashed ellipse) around a cluster of blobs,
 * with a small median annotation.
 */
function drawClusterLasso(
	ctx: CanvasRenderingContext2D,
	estimates: Array<{ mu: number; sigma: number }>,
	cluster: BlobCluster,
	canvasWidth: number,
	canvasHeight: number,
	color: string,
	unit: string,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	if (cluster.members.length === 0) return

	// Compute bounding box of cluster members' modes and peaks
	const members = cluster.members.map((i) => estimates[i])
	const modes = members.map((e) => Math.exp(e.mu - e.sigma ** 2))
	const minMode = Math.min(...modes)
	const maxMode = Math.max(...modes)
	const peaks = members.map((e) => peakCanvasY(e.mu, e.sigma, canvasHeight, config))
	const minPeakY = Math.min(...peaks)
	const baselineY = canvasHeight - config.padding

	const leftX = mathToCanvasX(minMode, canvasWidth, config)
	const rightX = mathToCanvasX(maxMode, canvasWidth, config)
	const centerX = (leftX + rightX) / 2
	const radiusX = Math.max((rightX - leftX) / 2 + 30, 35)
	const blobHeight = baselineY - minPeakY
	const radiusY = Math.max(blobHeight * 0.55, 25)
	const centerY = minPeakY + blobHeight * 0.45

	const seed = Math.round(cluster.medianMode * 1000) + cluster.members.length * 4321
	const rng = seededRng(seed)

	ctx.save()
	ctx.globalAlpha = 0.4
	ctx.strokeStyle = color
	ctx.lineWidth = 2
	ctx.setLineDash([6, 4])

	// Wobbly dashed ellipse
	sketchyEllipse(ctx, centerX, centerY, radiusX, radiusY, rng, 2, 40)
	ctx.stroke()
	ctx.setLineDash([])

	// Median annotation below the lasso
	const medianSnapped = snapVerdict(cluster.medianMode, unit)
	const fontSize = Math.min(16, Math.max(12, canvasHeight * 0.03))
	ctx.globalAlpha = 0.6
	ctx.font = `${fontSize}px 'Caveat', cursive`
	ctx.fillStyle = color
	ctx.textAlign = 'center'
	ctx.fillText(`~${medianSnapped}`, centerX, centerY + radiusY + fontSize + 2)

	ctx.restore()
}

/**
 * Draw a pattern prompt on the canvas — sketchy handwriting style.
 */
function drawPatternPrompt(
	ctx: CanvasRenderingContext2D,
	text: string,
	canvasWidth: number,
	canvasHeight: number,
	color: string,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	if (!text) return

	const pad = config.padding
	const seed = 77889900
	const rng = seededRng(seed)

	const fontSize = Math.min(Math.max(canvasHeight * 0.035, 14), 20)
	// Position in top-right to avoid overlapping annotations near the blob
	const x = canvasWidth - pad - 10
	const y = pad + 5

	ctx.save()
	ctx.globalAlpha = 0.6
	ctx.font = `italic ${fontSize}px 'Caveat', cursive`
	ctx.fillStyle = color
	ctx.textAlign = 'right'
	ctx.textBaseline = 'top'
	ctx.translate(x + jitter(rng, 1), y + jitter(rng, 1))
	ctx.rotate(jitter(rng, 0.01))
	ctx.fillText(text, 0, 0)
	ctx.restore()
}

/**
 * Draw a sketchy agreement ring around the combined blob.
 * Green = converged, amber = moderate divergence, red = high divergence.
 */
function drawAgreementRing(
	ctx: CanvasRenderingContext2D,
	mu: number,
	sigma: number,
	canvasWidth: number,
	canvasHeight: number,
	ringColor: string,
	config: CanvasConfig = DEFAULT_CONFIG,
): void {
	const mode = Math.exp(mu - sigma ** 2)
	const centerX = mathToCanvasX(mode, canvasWidth, config)
	const peakY = peakCanvasY(mu, sigma, canvasHeight, config)
	const baselineY = canvasHeight - config.padding
	const blobHeight = baselineY - peakY

	// Ring sized to hug the blob: X radius from P10–P90 span, Y radius capped
	const p10 = lognormalQuantile(0.1, mu, sigma)
	const p90 = lognormalQuantile(0.9, mu, sigma)
	const p10x = mathToCanvasX(p10, canvasWidth, config)
	const p90x = mathToCanvasX(p90, canvasWidth, config)
	const spanX = Math.abs(p90x - p10x)
	const radiusX = Math.max(40, spanX / 2 + 15)
	const radiusY = Math.max(30, Math.min(blobHeight * 0.55, radiusX * 1.5, 120))
	const centerY = peakY + blobHeight * 0.4

	const seed = Math.round(mu * 1000) + Math.round(sigma * 5555)

	ctx.save()
	ctx.globalAlpha = 0.5
	ctx.strokeStyle = ringColor
	ctx.lineWidth = 3

	// Draw wobbly ellipse — two passes for hand-drawn feel
	for (let pass = 0; pass < 2; pass++) {
		const passRng = seededRng(seed + pass * 777)
		ctx.lineWidth = pass === 0 ? 3 : 1.5
		ctx.globalAlpha = pass === 0 ? 0.5 : 0.3
		sketchyEllipse(ctx, centerX, centerY, radiusX, radiusY, passRng, 2, 48)
		ctx.stroke()
	}

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
	const {
		myEstimate,
		peerEstimates,
		revealed,
		history,
		unit,
		currentTicket,
		persistentHistory,
		selfAbstained,
	} = scene

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

	const hasMoved = scene.hasMoved ?? true
	const hasEverDragged = scene.hasEverDragged ?? true

	if (!selfAbstained) {
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

		if (hasMoved) {
			// Draw the user's committed blob
			drawBlob(ctx, myEstimate.mu, myEstimate.sigma, width, height, '#5b7b9a', 0.5)
		} else {
			// Draw ghost blob — dotted outline with "?" to invite interaction
			drawGhostBlob(ctx, myEstimate.mu, myEstimate.sigma, width, height, '#5b7b9a')
			// Show "Drag me!" arrow for first-timers who haven't dragged in this session
			if (!hasEverDragged && !revealed) {
				drawDragMeArrow(ctx, myEstimate.mu, myEstimate.sigma, width, height)
			}
		}

		// Annotations: show on own blob pre-reveal, on combined blob post-reveal
		if (!revealed && hasMoved) {
			drawAnnotations(ctx, myEstimate.mu, myEstimate.sigma, width, height, unit)
		}

		// Grab handle: show when blob is draggable (pre-reveal, or live-adjust)
		const canDrag = !revealed || (scene.liveAdjust ?? false)
		if (canDrag) {
			drawGrabHandle(ctx, myEstimate.mu, myEstimate.sigma, width, height, DEFAULT_CONFIG, scene.hoverHandle ?? false, scene.isDragging ?? false)
		}
	} else if (!revealed) {
		// Draw a big sketchy "?" when user has no idea — same hatched style as blobs
		const fontSize = Math.min(height * 0.45, 200)
		const color = '#5b7b9a'
		ctx.save()
		ctx.font = `${fontSize}px 'Caveat', cursive`
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.translate(width / 2, height / 2)
		ctx.rotate(-0.05)

		// Hatched fill
		ctx.globalAlpha = 0.35
		const pattern = createHatchPattern(ctx, color, 5, 1.5)
		if (pattern) {
			ctx.fillStyle = pattern
		} else {
			ctx.fillStyle = color
		}
		ctx.fillText('?', 0, 0)

		// Sketchy double-stroke outline
		ctx.globalAlpha = 0.4
		ctx.strokeStyle = color
		ctx.lineWidth = 1.5
		ctx.strokeText('?', 0.5, 0.5)
		ctx.lineWidth = 1
		ctx.strokeText('?', -0.5, -0.5)

		ctx.restore()
	}

	// Draw peer blobs only when revealed
	if (revealed) {
		for (const peer of peerEstimates) {
			drawBlob(ctx, peer.mu, peer.sigma, width, height, peer.color)
		}

		// Draw combined estimate from all participants (self excluded if abstained)
		const allEstimates = collectEstimates(myEstimate, peerEstimates, selfAbstained ?? false)
		const combined = combineEstimates(allEstimates)
		if (combined) {
			const conclusionMode = scene.conclusionMode ?? null
			const isCreator = scene.isCreator ?? false

			// If the facilitator has dragged a conclusion, use their mode + sigma
			const conclusionSigma =
				conclusionMode != null ? (scene.conclusionSigma ?? combined.sigma) : null
			const conclusionMu =
				conclusionSigma != null && conclusionMode != null
					? muFromMode(conclusionMode, conclusionSigma)
					: null

			if (conclusionMu != null && conclusionSigma != null) {
				// Ghost marker at original combined position
				drawCombinedGhost(ctx, combined.mu, combined.sigma, width, height)
				// Conclusion curve — drawn like combined but represents the facilitator's call
				drawCombinedBlob(ctx, conclusionMu, conclusionSigma, width, height)
			} else {
				// No conclusion yet — draw the original combined blob
				drawCombinedBlob(ctx, combined.mu, combined.sigma, width, height)
			}

			// Agreement ring — colour-coded by convergence (always on combined, not conclusion)
			const conv = convergenceState(combined.mu, combined.sigma, allEstimates)
			drawAgreementRing(ctx, combined.mu, combined.sigma, width, height, conv.color)

			// Cluster lassos — visible when divergent and 2+ clusters exist
			if (!conv.converged && allEstimates.length >= 2) {
				const clusters = detectClusters(allEstimates)
				if (clusters.length >= 2) {
					for (const cluster of clusters) {
						drawClusterLasso(ctx, allEstimates, cluster, width, height, conv.color, unit)
					}
				}
			}

			// Pattern prompt — tone-matched facilitation text
			const prompt = detectPattern(allEstimates, conv.converged)
			if (prompt) {
				drawPatternPrompt(ctx, prompt, width, height, conv.color)
			}

			// Grab handle on combined/conclusion curve for facilitator
			if (isCreator) {
				const handleMu = conclusionMu ?? combined.mu
				const handleSigma = conclusionSigma ?? combined.sigma
				drawGrabHandle(ctx, handleMu, handleSigma, width, height, DEFAULT_CONFIG, scene.hoverHandle ?? false, scene.isDragging ?? false)
			}

			// Verdict: show when converged OR when facilitator has placed a conclusion
			if (conv.converged || conclusionMode != null) {
				const effectiveMu = conclusionMu ?? combined.mu
				const effectiveSigma = conclusionSigma ?? combined.sigma
				drawVerdict(ctx, effectiveMu, effectiveSigma, width, height, unit, DEFAULT_CONFIG)
			}
		}
	}
}
