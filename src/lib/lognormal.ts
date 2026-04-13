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
 * Approximation of the error function erf(x).
 * Abramowitz & Stegun formula 7.1.26, max error ~1.5×10⁻⁷.
 */
function erf(x: number): number {
	const sign = x >= 0 ? 1 : -1
	const a = Math.abs(x)
	const t = 1 / (1 + 0.3275911 * a)
	const y =
		1 -
		((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
			t *
			Math.exp(-a * a)
	return sign * y
}

/**
 * Log-normal CDF: P(X ≤ x) for a log-normal distribution with parameters mu, sigma.
 * Returns the probability that a value is at most x.
 */
export function lognormalCdf(x: number, mu: number, sigma: number): number {
	if (x <= 0) return 0
	return 0.5 * (1 + erf((Math.log(x) - mu) / (sigma * Math.SQRT2)))
}

/**
 * Inverse log-normal CDF (quantile function): returns x such that P(X ≤ x) = p.
 */
export function lognormalQuantile(p: number, mu: number, sigma: number): number {
	if (p <= 0) return 0
	if (p >= 1) return Number.POSITIVE_INFINITY
	// Use the inverse normal CDF: quantile = exp(mu + sigma * Φ⁻¹(p))
	// Rational approximation of Φ⁻¹(p) (Abramowitz & Stegun 26.2.23)
	const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p))
	const c0 = 2.515517
	const c1 = 0.802853
	const c2 = 0.010328
	const d1 = 1.432788
	const d2 = 0.189269
	const d3 = 0.001308
	let z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t)
	if (p < 0.5) z = -z
	return Math.exp(mu + sigma * z)
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

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21]

/**
 * Snap a raw median value to a human-friendly verdict.
 * - points: nearest Fibonacci number (1, 2, 3, 5, 8, 13, 21)
 * - days: nearest reasonable time unit (half-day, day, week, month)
 */
export function snapVerdict(median: number, unit: string): string {
	if (unit === 'points') {
		let best = FIBONACCI[0]
		let bestDist = Math.abs(median - best)
		for (const f of FIBONACCI) {
			const d = Math.abs(median - f)
			if (d < bestDist) {
				best = f
				bestDist = d
			}
		}
		return `${best}`
	}

	// Days: snap to a natural time granularity
	if (median < 0.75) return '½ day'
	if (median < 1.25) return '1 day'
	if (median < 1.75) return '1½ days'
	if (median < 2.5) return '2 days'
	if (median < 3.5) return '3 days'
	if (median < 4.5) return '4 days'
	if (median < 6) return '1 week'
	if (median < 8.5) return '1½ weeks'
	if (median < 12) return '2 weeks'
	if (median < 17) return '3 weeks'
	if (median < 23) return '1 month'
	return `${Math.round(median)} days`
}
