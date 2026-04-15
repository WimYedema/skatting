import { lognormalPdf, lognormalQuantile } from './lognormal'

export interface BlobCluster {
	/** Indices into the original estimates array */
	members: number[]
	/** Median mode (X-axis value) of this cluster */
	medianMode: number
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Detect clusters in a set of estimates using 1D gap-based splitting on mode (peak) positions.
 * Returns 1–3 clusters. A gap must be at least `threshold` times the overall range to split.
 */
export function detectClusters(
	estimates: ReadonlyArray<{ mu: number; sigma: number }>,
	threshold = 0.4,
): BlobCluster[] {
	if (estimates.length === 0) return []
	if (estimates.length === 1) {
		const mode = Math.exp(estimates[0].mu - estimates[0].sigma ** 2)
		return [{ members: [0], medianMode: mode }]
	}

	// Compute mode (peak X position) for each estimate
	const indexed = estimates.map((e, i) => ({
		index: i,
		mode: Math.exp(e.mu - e.sigma ** 2),
	}))
	indexed.sort((a, b) => a.mode - b.mode)

	const range = indexed[indexed.length - 1].mode - indexed[0].mode
	if (range === 0) {
		return [{ members: indexed.map((e) => e.index), medianMode: indexed[0].mode }]
	}

	// Find the largest gap
	let maxGap = 0
	let maxGapIdx = 0
	for (let i = 1; i < indexed.length; i++) {
		const gap = indexed[i].mode - indexed[i - 1].mode
		if (gap > maxGap) {
			maxGap = gap
			maxGapIdx = i
		}
	}

	// If the largest gap is below threshold, it's one cluster
	if (maxGap / range < threshold) {
		const modes = indexed.map((e) => e.mode)
		return [{ members: indexed.map((e) => e.index), medianMode: median(modes) }]
	}

	// Split into two clusters at the largest gap
	const left = indexed.slice(0, maxGapIdx)
	const right = indexed.slice(maxGapIdx)

	// Check if either half has a secondary large gap (→ 3 clusters)
	const trySplit = (group: typeof indexed): (typeof indexed)[] => {
		if (group.length < 2) return [group]
		const r = group[group.length - 1].mode - group[0].mode
		if (r === 0) return [group]
		let mg = 0
		let mi = 0
		for (let i = 1; i < group.length; i++) {
			const g = group[i].mode - group[i - 1].mode
			if (g > mg) {
				mg = g
				mi = i
			}
		}
		if (mg / range < threshold) return [group] // Use overall range for threshold
		return [group.slice(0, mi), group.slice(mi)]
	}

	const parts = [...trySplit(left), ...trySplit(right)].slice(0, 3)
	return parts.map((p) => {
		const modes = p.map((e) => e.mode)
		return { members: p.map((e) => e.index), medianMode: median(modes) }
	})
}

/**
 * Compute the overlap area between two lognormal PDFs using numerical integration.
 * Returns a value in [0, 1] — the integral of min(f₁(x), f₂(x)) dx.
 * 1 = identical distributions, 0 = no overlap at all.
 */
export function lognormalOverlap(
	mu1: number,
	sigma1: number,
	mu2: number,
	sigma2: number,
	numSteps = 500,
): number {
	// Integration range: from near-zero to well beyond the larger P99
	const lo = 0.01
	const hi = Math.max(lognormalQuantile(0.995, mu1, sigma1), lognormalQuantile(0.995, mu2, sigma2))
	const dx = (hi - lo) / numSteps
	let sum = 0
	for (let i = 0; i <= numSteps; i++) {
		const x = lo + i * dx
		sum += Math.min(lognormalPdf(x, mu1, sigma1), lognormalPdf(x, mu2, sigma2))
	}
	return sum * dx
}

/**
 * Compute convergence state from individual estimates using pairwise overlap.
 * Overlap area ∈ [0, 1]: high overlap = agreement, low = divergence.
 * Falls back to combined P90/P10 when no individual estimates are provided.
 */
export function convergenceState(
	mu: number,
	sigma: number,
	estimates?: ReadonlyArray<{ mu: number; sigma: number }>,
): { overlap: number; color: string; converged: boolean } {
	let overlap: number

	if (estimates && estimates.length >= 2) {
		// Minimum pairwise overlap — the worst pair drives the score
		overlap = 1
		for (let i = 0; i < estimates.length; i++) {
			for (let j = i + 1; j < estimates.length; j++) {
				const ov = lognormalOverlap(
					estimates[i].mu,
					estimates[i].sigma,
					estimates[j].mu,
					estimates[j].sigma,
				)
				overlap = Math.min(overlap, ov)
			}
		}
	} else {
		// Fallback for solo: measure self-consistency via P90/P10 ratio
		const p10 = lognormalQuantile(0.1, mu, sigma)
		const p90 = lognormalQuantile(0.9, mu, sigma)
		const ratio = p10 > 0 ? p90 / p10 : 999
		// Map ratio to a pseudo-overlap: ratio=1 → 1.0, ratio=3 → 0.5, ratio=5 → 0.25
		overlap = Math.max(0, 1 - (ratio - 1) / 4)
	}

	if (overlap > 0.5) return { overlap, color: '#4a8c5c', converged: true } // green
	if (overlap > 0.25) return { overlap, color: '#c49a3c', converged: false } // amber
	return { overlap, color: '#b55a5a', converged: false } // red
}

/**
 * Detect the estimation pattern from revealed blobs and return a human-friendly prompt.
 */
export function detectPattern(
	estimates: ReadonlyArray<{ mu: number; sigma: number }>,
	converged: boolean,
): string {
	if (estimates.length === 0) return ''
	if (estimates.length === 1) return ''

	const clusters = detectClusters(estimates)
	const sigmas = estimates.map((e) => e.sigma)
	const highUncertaintyThreshold = 0.8
	const lowUncertaintyThreshold = 0.4

	// Check certainty patterns (Y-axis)
	const allUncertain = sigmas.every((s) => s > highUncertaintyThreshold)
	const someUncertain = sigmas.some((s) => s > highUncertaintyThreshold)
	const someCertain = sigmas.some((s) => s < lowUncertaintyThreshold)
	const mixedCertainty = someUncertain && someCertain

	if (converged) {
		return "You're all on the same page"
	}

	// Uncertainty-based patterns override cluster patterns
	if (allUncertain) {
		return "Nobody's confident — what don't we know?"
	}
	if (mixedCertainty) {
		return 'Someone knows something — care to share?'
	}

	// Cluster-based patterns
	if (clusters.length >= 3) {
		return 'All over the place — someone start talking'
	}
	if (clusters.length === 2) {
		return 'Two camps — looks like you have something to talk about'
	}

	// Single cluster but not converged (moderate spread)
	// Check for single outlier
	if (estimates.length >= 3) {
		const modes = estimates.map((e) => Math.exp(e.mu - e.sigma ** 2))
		const sorted = [...modes].sort((a, b) => a - b)
		const medianMode = sorted[Math.floor(sorted.length / 2)]
		const deviations = modes.map((m) => Math.abs(m - medianMode))
		const maxDev = Math.max(...deviations)
		const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length
		if (maxDev > avgDev * 2.5) {
			const outlierIdx = deviations.indexOf(maxDev)
			const outlierMode = modes[outlierIdx]
			if (outlierMode > medianMode) {
				return 'Someone sees dragons here'
			}
			return 'Someone thinks this is a walk in the park'
		}
	}

	return 'Close enough — or worth a chat?'
}
