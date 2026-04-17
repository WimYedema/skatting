<script lang="ts">
	import { lognormalMode } from '../lib/lognormal'
	import { snapVerdict } from '../lib/lognormal'
	import type { EstimatedTicket } from '../lib/types'

	interface Props {
		backlog: EstimatedTicket[]
		unit: string
		myEstimates: Map<string, { mu: number; sigma: number }>
		onExportCsv: () => void
		onExportExcel: () => void
		onClose: () => void
	}

	let { backlog, unit, myEstimates, onExportCsv, onExportExcel, onClose }: Props = $props()

	function estimateLabel(ticket: EstimatedTicket): string {
		if (ticket.median != null) {
			return `${ticket.median.toFixed(1)} ${unit}`
		}
		const est = myEstimates.get(ticket.id)
		if (est) {
			const mode = lognormalMode(est.mu, est.sigma)
			return `~${snapVerdict(mode, unit)}`
		}
		return '—'
	}
</script>

<div class="overlay" role="dialog" aria-label="Session summary">
	<div class="summary-panel">
		<h2>Session Summary</h2>
		<table class="summary-table">
			<thead>
				<tr>
					<th>ID</th>
					<th>Title</th>
					<th>Estimate</th>
				</tr>
			</thead>
			<tbody>
				{#each backlog as ticket}
					<tr class:unestimated={ticket.median == null && !myEstimates.has(ticket.id)}>
						<td class="summary-id">{ticket.id}</td>
						<td class="summary-title">{ticket.title}</td>
						<td class="summary-verdict">
							{estimateLabel(ticket)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="summary-actions">
			<button class="export" onclick={onExportCsv}>Export CSV ↓</button>
			<button class="export" onclick={onExportExcel}>Export Excel ↓</button>
			<button class="summary-close" onclick={onClose}>Back to session</button>
		</div>
	</div>
</div>

<style>
	.summary-panel {
		background: var(--c-surface-alt);
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-md);
		padding: var(--sp-2xl) 32px;
		max-width: 640px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: var(--shadow-lg);
	}

	.summary-panel h2 {
		margin: 0 0 var(--sp-lg);
		font-size: var(--fs-2xl);
		font-weight: 700;
		color: var(--c-text);
	}

	.summary-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font);
		font-size: var(--fs-base);
		margin-bottom: var(--sp-xl);
	}

	.summary-table th {
		text-align: left;
		padding: 6px 10px;
		border-bottom: 1px dashed var(--c-border-soft);
		color: var(--c-text-muted);
		font-weight: 400;
		font-size: 0.9rem;
	}

	.summary-table td {
		padding: 6px 10px;
		border-bottom: 1px solid rgba(176, 168, 144, 0.2);
	}

	.summary-id {
		color: var(--c-text-muted);
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.summary-title {
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.summary-verdict {
		font-weight: 600;
		color: var(--c-green);
		white-space: nowrap;
	}

	tr.unestimated .summary-verdict {
		color: #a09880;
	}

	.summary-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
	}

	.export {
		padding: var(--sp-sm) var(--sp-xl);
		background: rgba(90, 140, 80, 0.15);
		border: 1px dashed var(--c-green-border);
		border-radius: var(--radius-sm);
		color: var(--c-green);
		font-family: var(--font);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: background var(--tr-fast);
	}

	.export:hover {
		background: rgba(90, 140, 80, 0.3);
	}

	.summary-close {
		padding: var(--sp-sm) var(--sp-xl);
		background: rgba(160, 150, 130, 0.25);
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-sm);
		color: var(--c-text-soft);
		font-family: var(--font);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: background var(--tr-fast);
	}

	.summary-close:hover {
		background: rgba(160, 150, 130, 0.4);
	}
</style>
