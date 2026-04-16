<script lang="ts">
	import { getDebugEntries, onDebugChange, formatTime } from '../lib/debug'
	import { selfId } from '../lib/peer'

	interface Props {
		roomId: string
		peerCount: number
		sessionActive: boolean
	}

	let { roomId, peerCount, sessionActive }: Props = $props()

	let entries = $state(getDebugEntries())
	let expanded = $state(true)
	let logEl: HTMLDivElement | undefined = $state()

	$effect(() => {
		onDebugChange(() => {
			entries = [...getDebugEntries()]
		})
		return () => onDebugChange(null)
	})

	$effect(() => {
		// biome-ignore lint: auto-scroll when entries change
		entries.length
		if (logEl) logEl.scrollTop = logEl.scrollHeight
	})

	function tagColor(tag: string): string {
		switch (tag) {
			case 'peer': return '#5b9bd5'
			case 'send': return '#70ad47'
			case 'recv': return '#ed7d31'
			case 'relay': return '#a855f7'
			default: return '#999'
		}
	}

	function copyLog() {
		const header = `selfId=${selfId} room=${roomId || '—'} peers=${peerCount} session=${sessionActive ? 'yes' : 'no'}`
		const lines = entries.map((e) => {
			const data = e.data !== undefined ? ` ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}` : ''
			return `${formatTime(e.time)} [${e.tag}] ${e.msg}${data}`
		})
		navigator.clipboard.writeText(`${header}\n${lines.join('\n')}`)
		copyLabel = 'Copied!'
		setTimeout(() => (copyLabel = ''), 1500)
	}

	let copyLabel = $state('')
</script>

<div class="debug-panel" class:collapsed={!expanded}>
	<button class="debug-toggle" onclick={() => (expanded = !expanded)}>
		🐛 {expanded ? '▾' : '▸'}
	</button>
	{#if expanded}
		<div class="debug-info">
			<span class="debug-id" title={selfId}>self: {selfId.slice(0, 8)}</span>
			<span>room: <strong>{roomId || '—'}</strong></span>
			<span>peers: <strong>{peerCount}</strong></span>
			<span class="debug-status" class:active={sessionActive}>
				{sessionActive ? '● connected' : '○ disconnected'}
			</span>
			<button class="debug-copy" onclick={copyLog}>{copyLabel || '📋 Copy log'}</button>
		</div>
		<div class="debug-log" bind:this={logEl}>
			{#each entries as entry}
				<div class="debug-entry">
					<span class="debug-time">{formatTime(entry.time)}</span>
					<span class="debug-tag" style="color: {tagColor(entry.tag)}">[{entry.tag}]</span>
					<span class="debug-msg">{entry.msg}</span>
					{#if entry.data !== undefined}
						<span class="debug-data">{typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}</span>
					{/if}
				</div>
			{/each}
			{#if entries.length === 0}
				<div class="debug-empty">No events yet</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.debug-panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(20, 20, 20, 0.92);
		color: #ccc;
		font-family: 'Fira Code', 'Consolas', monospace;
		font-size: 11px;
		z-index: 9999;
		max-height: 260px;
		display: flex;
		flex-direction: column;
	}

	.debug-panel.collapsed {
		max-height: 28px;
	}

	.debug-toggle {
		padding: 4px 10px;
		background: rgba(40, 40, 40, 0.95);
		border: none;
		border-bottom: 1px solid #333;
		color: #aaa;
		cursor: pointer;
		font-size: 12px;
		text-align: left;
		font-family: inherit;
	}

	.debug-toggle:hover {
		background: #333;
	}

	.debug-info {
		display: flex;
		gap: 14px;
		padding: 4px 10px;
		border-bottom: 1px solid #333;
		color: #888;
		flex-shrink: 0;
	}

	.debug-info strong {
		color: #ddd;
	}

	.debug-id {
		color: #5b9bd5;
	}

	.debug-status.active {
		color: #70ad47;
	}

	.debug-copy {
		margin-left: auto;
		padding: 1px 8px;
		background: #333;
		border: 1px solid #555;
		border-radius: 3px;
		color: #aaa;
		font-family: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.debug-copy:hover {
		background: #444;
		color: #ddd;
	}

	.debug-log {
		overflow-y: auto;
		flex: 1;
		padding: 4px 0;
	}

	.debug-entry {
		display: flex;
		gap: 6px;
		padding: 1px 10px;
		line-height: 1.5;
	}

	.debug-entry:hover {
		background: rgba(255, 255, 255, 0.04);
	}

	.debug-time {
		color: #666;
		flex-shrink: 0;
	}

	.debug-tag {
		flex-shrink: 0;
		font-weight: 600;
		min-width: 48px;
	}

	.debug-msg {
		color: #ccc;
		flex-shrink: 0;
	}

	.debug-data {
		color: #777;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.debug-empty {
		padding: 8px 10px;
		color: #555;
		font-style: italic;
	}
</style>
