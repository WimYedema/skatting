<script lang="ts">
	import { generateRoomId } from '../lib/peer'

	interface Props {
		onJoin: (roomId: string, userName: string, unit: string | null) => void
	}

	let { onJoin }: Props = $props()

	let roomId = $state('')
	let userName = $state('')
	let unit = $state('points')
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
			onJoin(trimmedRoom, trimmedName, mode === 'create' ? unit : null)
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
			<div class="unit-picker">
				<label for="unit-select">Unit:</label>
				<select id="unit-select" bind:value={unit}>
					<option value="points">points</option>
					<option value="days">days</option>
				</select>
			</div>
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
		gap: 18px;
	}

	h1 {
		margin: 0;
		font-size: 4rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: #3a3530;
	}

	.subtitle {
		color: #8a8070;
		margin: 0 0 24px;
		font-size: 1.3rem;
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
		font-size: 1.1rem;
		color: #8a8070;
	}

	.room-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.room-code {
		font-size: 3rem;
		font-family: 'Caveat', cursive;
		letter-spacing: 0.3em;
		background: rgba(210, 200, 180, 0.4);
		padding: 12px 32px;
		border: 2px dashed #b0a890;
		border-radius: 3px;
		user-select: all;
		color: #3a3530;
	}

	.unit-picker {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.2rem;
	}

	.unit-picker select {
		font-family: 'Caveat', cursive;
		font-size: 1.2rem;
		padding: 4px 8px;
		border: 2px dashed #c0b89a;
		border-radius: 3px;
		background: rgba(245, 240, 230, 0.5);
		color: #3a3530;
		cursor: pointer;
	}

	input {
		font-family: 'Caveat', cursive;
		font-size: 1.8rem;
		text-align: center;
		letter-spacing: 0.15em;
		padding: 8px 20px;
		border: 2px dashed #c0b89a;
		border-radius: 3px;
		background: rgba(245, 240, 230, 0.5);
		color: #3a3530;
		outline: none;
		width: 220px;
	}

	input:focus {
		border-color: #3b7dd8;
	}

	input::placeholder {
		color: #a09880;
	}

	button {
		padding: 10px 28px;
		border: 1px dashed #8a9ab0;
		border-radius: 3px;
		font-family: 'Caveat', cursive;
		font-size: 1.3rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.primary {
		background: rgba(59, 125, 216, 0.2);
		color: #2a5090;
	}

	.primary:hover {
		background: rgba(59, 125, 216, 0.35);
	}

	.primary:disabled {
		background: rgba(160, 150, 130, 0.2);
		border-color: #c0b89a;
		cursor: not-allowed;
		color: #a09880;
	}

	.secondary {
		background: rgba(160, 150, 130, 0.2);
		color: #5a5040;
		border-color: #b0a890;
	}

	.secondary:hover {
		background: rgba(160, 150, 130, 0.35);
	}

	.back {
		background: transparent;
		color: #8a8070;
		font-size: 1rem;
		border-color: transparent;
	}

	.back:hover {
		color: #3a3530;
	}
</style>
