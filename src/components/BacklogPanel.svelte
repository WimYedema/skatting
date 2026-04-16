<script lang="ts">
	import type { EstimatedTicket } from '../lib/types'
	import { lognormalMode } from '../lib/lognormal'
	import ImportMenu from './ImportMenu.svelte'

	interface Props {
		tickets: EstimatedTicket[]
		currentIndex: number
		isCreator: boolean
		prepMode: boolean
		myEstimates: Map<string, { mu: number; sigma: number }>
		estimatedCount: number
		unit: string
		onSelect: (index: number) => void
		onReorder: (fromIndex: number, toIndex: number) => void
		onRemove: (index: number) => void
		onExportCsv: () => void
		onExportExcel: () => void
		onImportCsv?: (file: File) => void
		onPasteList?: () => void
		collapsed?: boolean
	}

	let { tickets, currentIndex, isCreator, prepMode, myEstimates, estimatedCount, unit, onSelect, onReorder, onRemove, onExportCsv, onExportExcel, onImportCsv, onPasteList, collapsed = $bindable(window.innerWidth < 768) }: Props = $props()
	let dragIndex = $state(-1)
	let dropIndex = $state(-1)

	function isEstimated(ticket: EstimatedTicket): boolean {
		return ticket.median != null
	}

	function isPrepared(ticket: EstimatedTicket): boolean {
		return myEstimates.has(ticket.id) && ticket.median == null
	}

	function myScore(ticket: EstimatedTicket): string | null {
		const est = myEstimates.get(ticket.id)
		if (!est) return null
		const mode = lognormalMode(est.mu, est.sigma)
		return mode < 10 ? mode.toFixed(1) : Math.round(mode).toString()
	}

	let preparedCount = $derived(tickets.filter((t) => myEstimates.has(t.id)).length)
</script>

<aside class="backlog-panel" class:collapsed>
	<button class="toggle" onclick={() => (collapsed = !collapsed)}>
		{collapsed ? '▶' : '◀'} Backlog
		{#if !collapsed}
			<span class="prep-count">
				{#if estimatedCount > 0}
					{estimatedCount}/{tickets.length} done
				{:else if preparedCount > 0}
					{preparedCount}/{tickets.length} prepared
				{/if}
			</span>
		{/if}
	</button>
	{#if !collapsed}
		<ul class="ticket-list">
			{#each tickets as ticket, i}
				<li
					class="ticket"
					class:current={i === currentIndex}
					class:estimated={isEstimated(ticket)}
					class:prepared={isPrepared(ticket)}
					class:drag-over={dropIndex === i && dragIndex !== i}
					draggable={isCreator}
					ondragstart={(e) => {
						dragIndex = i
						e.dataTransfer?.setData('text/plain', String(i))
						if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
					}}
					ondragover={(e) => {
						if (dragIndex < 0) return
						e.preventDefault()
						if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
						dropIndex = i
					}}
					ondragleave={() => {
						if (dropIndex === i) dropIndex = -1
					}}
					ondrop={(e) => {
						e.preventDefault()
						if (dragIndex >= 0 && dragIndex !== i) {
							onReorder(dragIndex, i)
						}
						dragIndex = -1
						dropIndex = -1
					}}
					ondragend={() => {
						dragIndex = -1
						dropIndex = -1
					}}
				>
					<button
						class="ticket-btn"
						disabled={!isCreator && !prepMode}
						onclick={() => onSelect(i)}
					>
						<span class="ticket-status">
							{#if ticket.median != null}
								✓
							{:else if isPrepared(ticket)}
								●
							{:else if i === currentIndex}
								▸
							{:else}
								·
							{/if}
						</span>
						<span class="ticket-id">{ticket.id}</span>
						<span class="ticket-title">{ticket.title}</span>
						{#if myScore(ticket)}
							<span class="ticket-my-score">{myScore(ticket)}</span>
						{/if}
						{#if ticket.median != null}
							<span class="ticket-verdict">{ticket.median.toFixed(1)}</span>
						{/if}
					</button>
					{#if isCreator}
						<button
							class="remove-btn"
							title="Remove ticket"
							onclick={() => onRemove(i)}
						>×</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if isCreator}
			<div class="bottom-bar">
				{#if onImportCsv && onPasteList}
					<ImportMenu
						label="+ Add more ▾"
						onImportCsv={onImportCsv}
						onPasteList={onPasteList}
					/>
				{/if}
				{#if estimatedCount > 0}
					<button class="bar-btn export" onclick={onExportCsv}>CSV ↓</button>
					<button class="bar-btn export" onclick={onExportExcel}>Excel ↓</button>
				{/if}
			</div>
		{/if}
	{/if}
</aside>

<style>
	.backlog-panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 260px;
		background: rgba(232, 224, 208, 0.95);
		border-left: 1px dashed var(--c-border-soft);
		display: flex;
		flex-direction: column;
		z-index: 10;
		transition: width var(--tr-normal);
	}

	.backlog-panel.collapsed {
		width: 40px;
	}

	/* Mobile: bottom drawer instead of side panel */
	@media (max-width: 768px) {
		.backlog-panel {
			top: auto;
			bottom: 0;
			left: 0;
			right: 0;
			width: 100%;
			max-height: 50vh;
			border-left: none;
			border-top: 1px dashed var(--c-border-soft);
			transition: max-height var(--tr-normal);
		}

		.backlog-panel.collapsed {
			width: 100%;
			max-height: 40px;
		}
	}

	.toggle {
		padding: var(--sp-sm) 10px;
		background: none;
		border: none;
		border-bottom: 1px dashed var(--c-border);
		color: var(--c-text-soft);
		font-family: var(--font);
		font-size: var(--fs-base);
		cursor: pointer;
		text-align: left;
		white-space: nowrap;
	}

	.toggle:hover {
		background: rgba(210, 200, 180, 0.3);
	}

	.prep-count {
		margin-left: auto;
		font-size: var(--fs-xs);
		color: var(--c-text-muted);
	}

	.ticket-list {
		list-style: none;
		margin: 0;
		padding: var(--sp-xs) 0;
		overflow-y: auto;
		flex: 1;
	}

	.ticket {
		display: flex;
		align-items: center;
		border-bottom: 1px solid rgba(176, 168, 144, 0.2);
	}

	.ticket-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px 10px;
		background: none;
		border: none;
		color: var(--c-text-soft);
		font-family: var(--font);
		font-size: 0.95rem;
		cursor: pointer;
		text-align: left;
	}

	.ticket-btn:hover:not(:disabled) {
		background: var(--c-neutral-bg);
	}

	.ticket-btn:disabled {
		cursor: default;
	}

	.ticket.current .ticket-btn {
		background: rgba(59, 125, 216, 0.12);
		color: var(--c-accent-text);
		font-weight: 600;
	}

	.ticket.estimated .ticket-btn {
		color: var(--c-text-muted);
	}

	.ticket.estimated .ticket-title {
		text-decoration: line-through;
		text-decoration-color: rgba(90, 80, 64, 0.4);
		color: var(--c-text-faint);
	}

	.ticket.estimated .ticket-id {
		text-decoration: line-through;
		text-decoration-color: rgba(90, 80, 64, 0.3);
		color: var(--c-text-faint);
	}

	.ticket.prepared .ticket-status {
		color: #5b7b9a;
	}

	.ticket-status {
		width: 14px;
		flex-shrink: 0;
		text-align: center;
	}

	.ticket-id {
		font-size: var(--fs-sm);
		color: var(--c-text-muted);
		flex-shrink: 0;
	}

	.ticket-title {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ticket-my-score {
		font-size: var(--fs-xs);
		color: var(--c-accent);
		background: rgba(59, 125, 216, 0.12);
		padding: 1px 5px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.ticket-verdict {
		font-size: var(--fs-xs);
		color: var(--c-green);
		background: rgba(90, 140, 80, 0.12);
		padding: 1px 5px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.ticket.drag-over {
		border-top: 2px solid #5b7b9a;
		background: rgba(91, 123, 154, 0.08);
	}

	.remove-btn {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		background: none;
		color: var(--c-border-soft);
		font-size: 0.9rem;
		cursor: pointer;
		border-radius: var(--radius-sm);
		line-height: 1;
		opacity: 0;
		transition: opacity var(--tr-fast);
	}

	.ticket:hover .remove-btn {
		opacity: 1;
	}

	.remove-btn:hover {
		background: rgba(180, 60, 60, 0.15);
		color: #a04040;
	}

	li[draggable='true'] {
		cursor: grab;
	}

	li[draggable='true']:active {
		cursor: grabbing;
	}

	.bottom-bar {
		display: flex;
		gap: 6px;
		padding: var(--sp-sm) 10px;
		border-top: 1px dashed var(--c-border);
		flex-wrap: wrap;
	}

	.bar-btn {
		flex: 1;
		padding: 5px 10px;
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-sm);
		background: var(--c-neutral-bg-light);
		color: var(--c-neutral-text);
		font-family: var(--font);
		font-size: 0.95rem;
		cursor: pointer;
		transition: background var(--tr-fast);
		text-align: center;
		white-space: nowrap;
	}

	.bar-btn:hover {
		background: rgba(210, 200, 180, 0.4);
	}

	.bar-btn.export {
		background: rgba(59, 125, 216, 0.12);
		border-color: var(--c-accent-border);
		color: var(--c-accent-text);
	}

	.bar-btn.export:hover {
		background: rgba(59, 125, 216, 0.25);
	}
</style>
