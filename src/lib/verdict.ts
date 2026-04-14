import { combineEstimates, lognormalQuantile } from './lognormal'
import type { Estimate, EstimatedTicket, HistoryEntry } from './types'

export interface VerdictResult {
	historyEntry: HistoryEntry
	median: number
	p10: number
	p90: number
	mu: number
	sigma: number
}

/**
 * Compute the verdict for a round: combine estimates, derive quantiles.
 * Returns null if there's nothing meaningful to record.
 */
export function computeVerdict(
	label: string,
	myEstimate: Estimate,
	peerEstimates: Estimate[],
): VerdictResult | null {
	const allEstimates = [myEstimate, ...peerEstimates]
	const combined = combineEstimates(allEstimates)

	if (combined) {
		return {
			historyEntry: { label, mu: combined.mu, sigma: combined.sigma },
			median: lognormalQuantile(0.5, combined.mu, combined.sigma),
			p10: lognormalQuantile(0.1, combined.mu, combined.sigma),
			p90: lognormalQuantile(0.9, combined.mu, combined.sigma),
			mu: combined.mu,
			sigma: combined.sigma,
		}
	}

	// Solo estimate — use personal values
	if (peerEstimates.length === 0) {
		return {
			historyEntry: { label, mu: myEstimate.mu, sigma: myEstimate.sigma },
			median: lognormalQuantile(0.5, myEstimate.mu, myEstimate.sigma),
			p10: lognormalQuantile(0.1, myEstimate.mu, myEstimate.sigma),
			p90: lognormalQuantile(0.9, myEstimate.mu, myEstimate.sigma),
			mu: myEstimate.mu,
			sigma: myEstimate.sigma,
		}
	}

	return null
}

/**
 * Apply a verdict to an EstimatedTicket and return the updated history entry.
 */
export function applyVerdict(ticket: EstimatedTicket, verdict: VerdictResult, unit: string): void {
	ticket.median = verdict.median
	ticket.p10 = verdict.p10
	ticket.p90 = verdict.p90
	ticket.estimateUnit = unit
}

/**
 * Update or insert a history entry by label. Returns a new array.
 */
export function upsertHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
	const idx = history.findIndex((h) => h.label === entry.label)
	if (idx >= 0) {
		const updated = [...history]
		updated[idx] = entry
		return updated
	}
	return [...history, entry]
}
