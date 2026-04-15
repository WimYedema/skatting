<script lang="ts">
	interface Props {
		existingCount: number
		importCount: number
		onMerge: () => void
		onReplace: () => void
		onCancel: () => void
	}

	let { existingCount, importCount, onMerge, onReplace, onCancel }: Props = $props()
</script>

<div class="overlay" role="dialog" aria-label="Import backlog">
	<div class="import-confirm">
		<h2>You already have a backlog</h2>
		<p>{existingCount} tickets loaded — importing {importCount} new ones.</p>
		<div class="import-actions">
			<button class="primary" onclick={onMerge}>Merge (add new)</button>
			<button class="danger" onclick={onReplace}>Replace all</button>
			<button class="secondary" onclick={onCancel}>Cancel</button>
		</div>
	</div>
</div>

<style>
	.import-confirm {
		background: var(--c-surface-alt);
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-md);
		padding: var(--sp-2xl) 32px;
		max-width: 400px;
		font-family: var(--font);
		text-align: center;
	}

	.import-confirm h2 {
		margin: 0 0 var(--sp-sm);
		font-size: 1.4rem;
		color: var(--c-text);
	}

	.import-confirm p {
		margin: 0 0 var(--sp-lg);
		font-size: var(--fs-lg);
		color: var(--c-text-soft);
	}

	.import-actions {
		display: flex;
		gap: 10px;
		justify-content: center;
	}

	.import-actions button {
		font-family: var(--font);
		font-size: var(--fs-lg);
		padding: 6px var(--sp-lg);
		border-radius: 4px;
		border: 1px dashed var(--c-border-soft);
		cursor: pointer;
	}

	.import-actions .primary {
		background: rgba(91, 123, 154, 0.25);
		color: var(--c-text);
	}

	.import-actions .danger {
		background: var(--c-danger-bg);
		color: var(--c-danger);
		border-color: rgba(180, 80, 60, 0.4);
	}

	.import-actions .secondary {
		background: rgba(160, 150, 130, 0.2);
		color: var(--c-text-soft);
	}
</style>
