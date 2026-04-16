<script lang="ts">
	interface Props {
		label: string
		onImportCsv: (file: File) => void
		onPasteList: () => void
		showHint?: boolean
		dropUp?: boolean
	}

	let { label, onImportCsv, onPasteList, showHint = true, dropUp = true }: Props = $props()
	let open = $state(false)
</script>

<div class="import-menu">
	<button class="import-toggle" onclick={() => (open = !open)}>
		{label}
	</button>
	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="import-menu-backdrop" onclick={() => (open = false)}></div>
		<div class="import-menu-dropdown" class:drop-down={!dropUp}>
			<label class="import-menu-item">
				<input
					type="file"
					accept=".csv"
					class="file-input"
					onchange={(e) => {
						const file = (e.target as HTMLInputElement).files?.[0]
						if (file) onImportCsv(file)
						;(e.target as HTMLInputElement).value = ''
						open = false
					}}
				/>
				📋 From CSV file
			</label>
			<button class="import-menu-item" onclick={() => { onPasteList(); open = false }}>
				📝 Paste a list
			</button>
			{#if showHint}
				<div class="import-menu-hint">or drop a file onto the page</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.import-menu {
		position: relative;
		flex: 1;
	}

	.import-toggle {
		width: 100%;
		padding: var(--sp-xs) var(--sp-md);
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-sm);
		background: rgba(210, 200, 180, 0.25);
		color: var(--c-neutral-text);
		font-family: var(--font);
		font-size: var(--fs-base);
		cursor: pointer;
		transition: background var(--tr-fast);
		white-space: nowrap;
		text-align: center;
	}

	.import-toggle:hover {
		background: var(--c-neutral-bg-hover);
	}

	.import-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 19;
	}

	.import-menu-dropdown {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		min-width: 100%;
		width: max-content;
		background: var(--c-surface-alt);
		border: 1px dashed var(--c-border-soft);
		border-radius: 4px;
		box-shadow: var(--shadow-md);
		z-index: 20;
		padding: var(--sp-xs) 0;
	}

	.import-menu-item {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: var(--sp-sm) 14px;
		border: none;
		background: none;
		color: var(--c-text);
		font-family: var(--font);
		font-size: var(--fs-md);
		cursor: pointer;
		white-space: nowrap;
		text-align: left;
	}

	.import-menu-item:hover {
		background: rgba(210, 200, 180, 0.4);
	}

	.import-menu-hint {
		padding: var(--sp-xs) 14px 6px;
		font-size: var(--fs-sm);
		color: var(--c-text-faint);
		border-top: 1px solid rgba(176, 168, 144, 0.25);
	}

	.import-menu-dropdown.drop-down {
		bottom: auto;
		top: calc(100% + 4px);
	}

	.file-input {
		display: none;
	}
</style>
