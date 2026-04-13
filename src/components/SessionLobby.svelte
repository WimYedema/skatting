<script lang="ts">
	import { generateRoomId } from '../lib/peer'

	interface Props {
		onJoin: (roomId: string, userName: string) => void
	}

	let { onJoin }: Props = $props()

	let roomId = $state('')
	let userName = $state('')
	let mode = $state<'choose' | 'create' | 'join'>('choose')

	function handleCreate() {
		roomId = generateRoomId()
		mode = 'create'
	}

	function handleJoinMode() {
		roomId = ''
		mode = 'join'
	}

	function handleSubmit() {
		const trimmedRoom = roomId.trim().toLowerCase()
		const trimmedName = userName.trim()
		if (trimmedRoom.length > 0 && trimmedName.length > 0) {
			onJoin(trimmedRoom, trimmedName)
		}
	}

	let canSubmit = $derived(roomId.trim().length > 0 && userName.trim().length > 0)
</script>

<div class="lobby">
	<h1>Estimate</h1>
	<p class="subtitle">2D continuous estimation for agile teams</p>

	{#if mode === 'choose'}
		<div class="form-group">
			<label for="user-name">Your name</label>
			<input
				id="user-name"
				type="text"
				bind:value={userName}
				placeholder="e.g. Alice"
				maxlength="30"
			/>
		</div>
		<div class="actions">
			<button class="primary" onclick={handleCreate} disabled={userName.trim().length === 0}>
				Create Session
			</button>
			<button class="secondary" onclick={handleJoinMode} disabled={userName.trim().length === 0}>
				Join Session
			</button>
		</div>
	{:else if mode === 'create'}
		<div class="room-info">
			<p>Share this code with your team:</p>
			<div class="room-code">{roomId}</div>
			<button class="primary" onclick={handleSubmit} disabled={!canSubmit}>Start</button>
			<button class="back" onclick={() => (mode = 'choose')}>← Back</button>
		</div>
	{:else}
		<div class="room-info">
			<p>Enter room code:</p>
			<input
				type="text"
				bind:value={roomId}
				placeholder="e.g. abc23"
				maxlength="10"
				onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && canSubmit && handleSubmit()}
			/>
			<button class="primary" onclick={handleSubmit} disabled={!canSubmit}>
				Join
			</button>
			<button class="back" onclick={() => (mode = 'choose')}>← Back</button>
		</div>
	{/if}
</div>

<style>
	.lobby {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-size: 3rem;
	}

	.subtitle {
		color: #94a3b8;
		margin: 0 0 24px;
	}

	.actions {
		display: flex;
		gap: 12px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}

	label {
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.room-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.room-code {
		font-size: 2.5rem;
		font-family: monospace;
		letter-spacing: 0.3em;
		background: #1e293b;
		padding: 12px 32px;
		border-radius: 8px;
		user-select: all;
	}

	input {
		font-size: 1.5rem;
		text-align: center;
		letter-spacing: 0.2em;
		padding: 10px 20px;
		border: 2px solid #334155;
		border-radius: 8px;
		background: #1e293b;
		color: #e2e8f0;
		outline: none;
		width: 200px;
	}

	input:focus {
		border-color: #3b82f6;
	}

	button {
		padding: 10px 28px;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		cursor: pointer;
	}

	.primary {
		background: #3b82f6;
		color: white;
	}

	.primary:hover {
		background: #2563eb;
	}

	.primary:disabled {
		background: #334155;
		cursor: not-allowed;
	}

	.secondary {
		background: #334155;
		color: #e2e8f0;
	}

	.secondary:hover {
		background: #475569;
	}

	.back {
		background: transparent;
		color: #94a3b8;
		font-size: 0.875rem;
	}

	.back:hover {
		color: #e2e8f0;
	}
</style>
