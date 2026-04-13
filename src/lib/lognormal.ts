/**
 * Log-normal PDF: f(x) = (1 / (x * sigma * sqrt(2pi))) * exp(-(ln(x) - mu)^2 / (2 * sigma^2))
 * Returns 0 for x <= 0.
 */
export function lognormalPdf(x: number, mu: number, sigma: number): number {
	if (x <= 0) return 0
	const logX = Math.log(x)
	const exponent = -((logX - mu) ** 2) / (2 * sigma ** 2)
	return Math.exp(exponent) / (x * sigma * Math.sqrt(2 * Math.PI))
}

/**
 * Generate an array of {x, y} points representing the log-normal PDF curve.
 * The curve is scaled so that its visual area (trapezoid sum) equals `targetArea`.
 *
 * @param mu - log-mean (controls horizontal position)
 * @param sigma - log-std-dev (controls spread; higher = wider & shorter)
 * @param targetArea - desired visual area of the rendered shape
 * @param numPoints - number of sample points along the curve
 * @returns array of {x, y} points in "math space" (x >= 0, y >= 0)
 */
export function generateBlobPoints(
	mu: number,
	sigma: number,
	targetArea: number,
	numPoints = 200,
): Array<{ x: number; y: number }> {
	// Determine a reasonable x-range: from near-zero to well past the right tail
	const mode = Math.exp(mu - sigma ** 2)
	const mean = Math.exp(mu + sigma ** 2 / 2)
	const xMax = mean + 4 * Math.sqrt((Math.exp(sigma ** 2) - 1) * Math.exp(2 * mu + sigma ** 2))
	const xMin = Math.max(mode * 0.01, 1e-6)

	const step = (xMax - xMin) / (numPoints - 1)
	const rawPoints: Array<{ x: number; y: number }> = []
	let rawArea = 0

	for (let i = 0; i < numPoints; i++) {
		const x = xMin + i * step
		const y = lognormalPdf(x, mu, sigma)
		rawPoints.push({ x, y })
		if (i > 0) {
			// Trapezoid rule for area accumulation
			rawArea += ((rawPoints[i - 1].y + y) / 2) * step
		}
	}

	// Scale y-values so total area equals targetArea
	const scale = rawArea > 0 ? targetArea / rawArea : 1
	return rawPoints.map((p) => ({ x: p.x, y: p.y * scale }))
}

/** Mode (peak x-position) of a log-normal distribution */
export function lognormalMode(mu: number, sigma: number): number {
	return Math.exp(mu - sigma ** 2)
}

/** Mean of a log-normal distribution */
export function lognormalMean(mu: number, sigma: number): number {
	return Math.exp(mu + sigma ** 2 / 2)
}

/** Compute mu from a desired mode position: mode = exp(mu - sigma²) → mu = ln(mode) + sigma² */
export function muFromMode(mode: number, sigma: number): number {
	return Math.log(Math.max(mode, 1e-6)) + sigma ** 2
}

/**
 * Combine multiple log-normal estimates using precision weighting (Bayesian product of experts).
 * More certain estimates (lower σ) get more weight. Combined σ is always narrower.
 */
export function combineEstimates(
	estimates: Array<{ mu: number; sigma: number }>,
): { mu: number; sigma: number } | null {
	if (estimates.length === 0) return null
	if (estimates.length === 1) return { mu: estimates[0].mu, sigma: estimates[0].sigma }

	// Filter out degenerate estimates (sigma must be positive and finite)
	const valid = estimates.filter((e) => e.sigma > 0 && Number.isFinite(e.sigma))
	if (valid.length === 0) return null
	if (valid.length === 1) return { mu: valid[0].mu, sigma: valid[0].sigma }

	let precisionSum = 0
	let weightedMuSum = 0
	for (const est of valid) {
		const precision = 1 / est.sigma ** 2
		precisionSum += precision
		weightedMuSum += est.mu * precision
	}

	const combinedSigma = Math.sqrt(1 / precisionSum)
	const combinedMu = weightedMuSum / precisionSum

	return { mu: combinedMu, sigma: combinedSigma }
}
