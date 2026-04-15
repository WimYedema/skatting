/**
 * Seeded pseudo-random number generator (mulberry32).
 * Produces deterministic jitter so blobs don't wobble on every redraw.
 */
export function seededRng(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Small random offset for sketchy lines. Deterministic per seed. */
export function jitter(rng: () => number, amount = 1.5): number {
	return (rng() - 0.5) * 2 * amount
}

/** Draw a wobbly ellipse path — the shared sketchy primitive for agreement rings, cluster lassos, etc. */
export function sketchyEllipse(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	rng: () => number,
	jitterAmt = 2,
	steps = 40,
): void {
	ctx.beginPath()
	for (let i = 0; i <= steps; i++) {
		const angle = (i / steps) * Math.PI * 2
		const x = cx + rx * Math.cos(angle) + jitter(rng, jitterAmt)
		const y = cy + ry * Math.sin(angle) + jitter(rng, jitterAmt)
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	}
	ctx.closePath()
}

/** Create a diagonal hatch pattern for a given color */
export function createHatchPattern(
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

/**
 * Draw an elastic-looking arrow from (x0,y0) to (x1,y1).
 * Single cubic bezier whose bow increases with distance.
 */
export function drawSketchyArrow(
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
