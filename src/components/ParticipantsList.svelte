<script lang="ts">
	interface ParticipantInfo {
		id: string
		name: string
		color: string
		isReady: boolean
		isSkipped: boolean
		isAbstained: boolean
		hasMic: boolean
		isLeader: boolean
		isSelf: boolean
		isOffline?: boolean
		isStale?: boolean
	}

	interface Props {
		participants: ParticipantInfo[]
		readyCount: number
		activeCount: number
		isCreator: boolean
		holdsMic: boolean
		micHolder: string | null
		prepMode: boolean
		revealed: boolean
		prepDone: Array<{ name: string; ticketCount: number }>
		onTakeMicBack: () => void
		onHandOffMic: (peerId: string) => void
		onSkipPeer: (peerId: string) => void
	}

	let { participants, readyCount, activeCount, isCreator, holdsMic, micHolder, prepMode, revealed, prepDone, onTakeMicBack, onHandOffMic, onSkipPeer }: Props = $props()
</script>

<div class="participants">
	{#each participants as p}
		<div class="participant" class:is-ready={p.isReady} class:is-skipped={p.isSkipped} class:is-offline={p.isOffline} class:is-stale={p.isStale}>
			<span class="ready-dot" class:ready={p.isReady} class:stale={p.isStale} style={p.color ? `--peer-color: ${p.color}` : ''}></span>
			<span class="name">{p.name}{#if p.isSelf} (you){/if}{#if p.isOffline} <span class="offline-tag">offline</span>{/if}{#if p.isStale} <span class="stale-tag">⚠</span>{/if}{#if p.isAbstained} <span class="abstain-tag">🤷</span>{/if}{#if p.isSkipped} <span class="skipped-tag">skipped</span>{/if}{#if p.hasMic}<span class="mic-tag"> 🎤</span>{/if}{#if p.isLeader}<span class="leader-tag"> ✎</span>{/if}</span>
			{#if p.isSelf && isCreator && micHolder !== null}
				<button class="mic-action" title="Take mic back" onclick={onTakeMicBack}>← Take 🎤</button>
			{/if}
			{#if !p.isSelf && isCreator && !p.hasMic && !prepMode}
				<button class="mic-action" title="Give mic to {p.name}" onclick={() => onHandOffMic(p.id)}>Give 🎤</button>
			{/if}
			{#if !p.isSelf && holdsMic && !prepMode && !revealed && !p.isReady && !p.isSkipped}
				<button class="skip-btn" title="Skip this participant" onclick={() => onSkipPeer(p.id)}>✕</button>
			{/if}
		</div>
	{/each}
	{#if !prepMode}
		<span class="ready-count">{readyCount}/{activeCount} ready</span>
	{/if}
	{#if prepMode && prepDone.length > 0}
		<span class="prep-done-divider">│</span>
		{#each prepDone as signal}
			<span class="prep-done-signal" title="{signal.name} prepped {signal.ticketCount} tickets">
				<span class="prep-done-dot"></span>
				{signal.name} <span class="prep-done-count">({signal.ticketCount})</span>
			</span>
		{/each}
	{/if}
</div>

<style>
	.participants {
		display: flex;
		align-items: center;
		gap: var(--sp-md);
		padding: 6px var(--sp-md);
		background: var(--c-neutral-bg);
		border: 1px dashed var(--c-border);
		border-radius: var(--radius-sm);
		font-size: var(--fs-base);
		flex-wrap: wrap;
	}

	.participant {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--c-text-muted);
		transition: color var(--tr-normal);
	}

	.participant.is-ready {
		color: var(--c-text);
	}

	.participant.is-skipped {
		opacity: 0.45;
	}

	.participant.is-offline {
		opacity: 0.4;
	}

	.participant.is-offline .name {
		text-decoration: line-through;
	}

	.offline-tag {
		font-size: 0.75em;
		color: var(--c-text-muted);
		font-style: italic;
	}

	.ready-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--c-border);
		transition: background var(--tr-slow);
	}

	.ready-dot.ready {
		background: var(--peer-color, #22c55e);
	}

	.name {
		white-space: nowrap;
	}

	.ready-count {
		margin-left: auto;
		color: var(--c-text-ghost);
		font-size: var(--fs-sm);
	}

	.skipped-tag {
		font-family: var(--font);
		font-size: 0.8em;
		color: #b0a090;
		font-style: italic;
	}

	.skip-btn {
		padding: 0 var(--sp-xs);
		border: none;
		background: none;
		color: #b0a090;
		font-size: var(--fs-sm);
		cursor: pointer;
		line-height: 1;
		opacity: 0.6;
		transition: opacity var(--tr-fast), color var(--tr-fast);
	}

	.skip-btn:hover {
		opacity: 1;
		color: #8a6040;
	}

	.abstain-tag {
		font-size: 0.85em;
	}

	.leader-tag {
		font-family: var(--font);
		font-size: 0.85em;
		color: var(--c-warm);
		font-style: italic;
	}

	.mic-tag {
		font-size: 0.85em;
	}

	.mic-action {
		padding: 1px 6px;
		border: 1px dashed var(--c-border);
		border-radius: var(--radius-sm);
		background: var(--c-neutral-bg-light);
		color: var(--c-warm);
		font-family: var(--font);
		font-size: var(--fs-xs);
		cursor: pointer;
		line-height: 1.2;
		opacity: 0;
		transition: opacity var(--tr-fast);
		white-space: nowrap;
	}

	.participant:hover .mic-action {
		opacity: 1;
	}

	.mic-action:hover {
		background: var(--c-neutral-bg-hover);
		color: #5a5040;
	}

	.prep-done-divider {
		color: var(--c-border);
		font-size: var(--fs-sm);
	}

	.prep-done-signal {
		display: flex;
		align-items: center;
		gap: var(--sp-xs);
		color: var(--c-green-signal);
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.prep-done-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--c-green-border);
	}

	.prep-done-count {
		color: #8a9a80;
		font-size: var(--fs-xs);
	}

	.participant.is-stale {
		opacity: 0.6;
	}

	.ready-dot.stale {
		background: var(--c-red) !important;
		animation: pulse-stale 2s ease-in-out infinite;
	}

	.stale-tag {
		font-size: 0.85em;
		color: var(--c-red);
		cursor: help;
	}

	@keyframes pulse-stale {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}
</style>
