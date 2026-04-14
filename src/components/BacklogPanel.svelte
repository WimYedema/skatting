<script lang="ts">
	import type { EstimatedTicket } from '../lib/types'

	interface Props {
		tickets: EstimatedTicket[]
		currentIndex: number
		isCreator: boolean
		prepMode: boolean
		myEstimates: Map<string, { mu: number; sigma: number }>
		estimatedCount: number
		onSelect: (index: number) => void
		onReorder: (fromIndex: number, toIndex: number) => void
		onRemove: (index: number) => void
		onExportCsv: () => void
		onExportExcel: () => void
	}

	let { tickets, currentIndex, isCreator, prepMode, myEstimates, estimatedCount, onSelect, onReorder, onRemove, onExportCsv, onExportExcel }: Props = $props()

	let collapsed = $state(window.innerWidth < 768)
	let dragIndex = $state(-1)
	let dropIndex = $state(-1)

	function isEstimated(ticket: EstimatedTicket): boolean {
		return ticket.median != null || myEstimates.has(ticket.id)
	}

	function isPrepared(ticket: EstimatedTicket): boolean {
		return myEstimates.has(ticket.id) && ticket.median == null
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
		{#if isCreator && estimatedCount > 0}
			<div class="export-bar">
				<button class="export-btn" onclick={onExportCsv}>CSV ↓</button>
				<button class="export-btn" onclick={onExportExcel}>Excel ↓</button>
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
		border-left: 1px dashed #b0a890;
		display: flex;
		flex-direction: column;
		z-index: 10;
		transition: width 0.2s;
	}

	.backlog-panel.collapsed {
		width: 40px;
	}

	.toggle {
		padding: 8px 10px;
		background: none;
		border: none;
		border-bottom: 1px dashed #c0b89a;
		color: #6a6050;
		font-family: 'Caveat', cursive;
		font-size: 1rem;
		cursor: pointer;
		text-align: left;
		white-space: nowrap;
	}

	.toggle:hover {
		background: rgba(210, 200, 180, 0.3);
	}

	.prep-count {
		margin-left: auto;
		font-size: 0.8rem;
		color: #8a8070;
	}

	.ticket-list {
		list-style: none;
		margin: 0;
		padding: 4px 0;
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
		color: #6a6050;
		font-family: 'Caveat', cursive;
		font-size: 0.95rem;
		cursor: pointer;
		text-align: left;
	}

	.ticket-btn:hover:not(:disabled) {
		background: rgba(210, 200, 180, 0.35);
	}

	.ticket-btn:disabled {
		cursor: default;
	}

	.ticket.current .ticket-btn {
		background: rgba(59, 125, 216, 0.12);
		color: #2a5090;
		font-weight: 600;
	}

	.ticket.estimated .ticket-btn {
		color: #8a8070;
	}

	.ticket.estimated .ticket-title {
		text-decoration: line-through;
		text-decoration-color: rgba(90, 80, 64, 0.4);
		color: #a09880;
	}

	.ticket.estimated .ticket-id {
		text-decoration: line-through;
		text-decoration-color: rgba(90, 80, 64, 0.3);
		color: #a09880;
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
		font-size: 0.85rem;
		color: #8a8070;
		flex-shrink: 0;
	}

	.ticket-title {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ticket-verdict {
		font-size: 0.8rem;
		color: #4a6a40;
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
		color: #b0a890;
		font-size: 0.9rem;
		cursor: pointer;
		border-radius: 3px;
		line-height: 1;
		opacity: 0;
		transition: opacity 0.15s;
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

  .export-bar {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px dashed #c0b89a;
  }

  .export-btn {
    flex: 1;
    padding: 5px 10px;
    border: 1px dashed #8a9ab0;
    border-radius: 3px;
    background: rgba(59, 125, 216, 0.12);
    color: #2a5090;
    font-family: 'Caveat', cursive;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .export-btn:hover {
    background: rgba(59, 125, 216, 0.25);
  }
</style>
