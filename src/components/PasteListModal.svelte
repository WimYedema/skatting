<script lang="ts">
	import { parseList } from '../lib/csv'
	import type { ImportedTicket } from '../lib/types'

	interface Props {
		onImport: (tickets: ImportedTicket[]) => void
		onCancel: () => void
	}

	let { onImport, onCancel }: Props = $props()
	let pasteText = $state('')
	let tickets = $derived(parseList(pasteText))
</script>

<div class="overlay" role="dialog" aria-label="Paste a list">
	<div class="paste-modal">
		<h2>Paste a list</h2>
		<p>One ticket title per line</p>
		<textarea
			class="paste-textarea"
			rows="10"
			placeholder={"Login page redesign\nFix checkout bug\nAdd dark mode\n…"}
			bind:value={pasteText}
		></textarea>
		<div class="import-actions">
			<button class="primary" disabled={tickets.length === 0} onclick={() => onImport(tickets)}>Import {tickets.length || ''}</button>
			<button class="secondary" onclick={onCancel}>Cancel</button>
		</div>
	</div>
</div>

<style>
	.paste-modal {
		background: var(--c-surface-alt);
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-md);
		padding: var(--sp-2xl) 32px;
		max-width: 420px;
		width: 90%;
		font-family: var(--font);
	}

	.paste-modal h2 {
		margin: 0 0 var(--sp-xs);
		font-size: 1.4rem;
		color: var(--c-text);
	}

	.paste-modal p {
		margin: 0 0 var(--sp-md);
		font-size: var(--fs-base);
		color: var(--c-text-muted);
	}

	.paste-textarea {
		width: 100%;
		box-sizing: border-box;
		font-family: var(--font);
		font-size: var(--fs-md);
		color: var(--c-text);
		background: rgba(245, 240, 230, 0.6);
		border: 1px dashed var(--c-border);
		border-radius: var(--radius-sm);
		padding: 10px;
		resize: vertical;
		outline: none;
		margin-bottom: 14px;
	}

	.paste-textarea:focus {
		border-color: var(--c-accent);
	}

	.paste-textarea::placeholder {
		color: var(--c-border-soft);
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

	.import-actions .primary:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.import-actions .secondary {
		background: rgba(160, 150, 130, 0.2);
		color: var(--c-text-soft);
	}
</style>
