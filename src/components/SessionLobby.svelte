<script lang="ts">
	import { generateRoomId } from '../lib/peer'
	import {
		deleteSession,
		getLastUserName,
		getSavedSessions,
		type SavedSession,
	} from '../lib/session-store'

	interface Props {
		onJoin: (roomId: string, userName: string, unit: string | null) => void
	}

	let { onJoin }: Props = $props()

	let roomId = $state('')
	let userName = $state(getLastUserName())
	let unit = $state('points')
	let mode = $state<'choose' | 'create' | 'join'>('choose')
	let recentSessions = $state(getSavedSessions())

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

	function handleRejoin(saved: SavedSession) {
		const trimmedName = userName.trim() || saved.userName
		onJoin(saved.roomId, trimmedName, saved.isCreator ? saved.unit : null)
	}

	function handleDelete(roomId: string) {
		deleteSession(roomId)
		recentSessions = getSavedSessions()
	}

	function formatDate(timestamp: number): string {
		const d = new Date(timestamp)
		const now = new Date()
		if (d.toDateString() === now.toDateString()) {
			return `today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
		}
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
	}

	let canSubmit = $derived(roomId.trim().length > 0 && userName.trim().length > 0)
</script>

<div class="lobby">
	<h1>Estimate</h1>
	<p class="subtitle">2D continuous estimation for agile teams</p>

	{#if mode === 'choose'}
		<div class="name-bar">
			<label for="user-name">Your name</label>
			<input
				id="user-name"
				type="text"
				bind:value={userName}
				placeholder="e.g. Alice"
				maxlength="30"
				autocomplete="off"
				data-1p-ignore
				data-bwignore
				data-lpignore="true"
			/>
		</div>

		{#if recentSessions.length > 0}
			<div class="rooms">
				{#each recentSessions as saved (saved.roomId)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="room-card"
						class:disabled={userName.trim().length === 0}
						onclick={() => userName.trim().length > 0 && handleRejoin(saved)}
					>
						<button
							class="room-delete"
							onclick={(e: MouseEvent) => { e.stopPropagation(); handleDelete(saved.roomId) }}
							title="Remove"
						>
							×
						</button>
						<span class="room-name">
							{#if saved.topic}
								{saved.topic}
							{:else}
								Room {saved.roomId}
							{/if}
						</span>
						{#if saved.peerNames?.length}
							<span class="room-peers">{saved.peerNames.join(', ')}</span>
						{/if}
						<span class="room-footer">
							<span class="room-code">{saved.roomId}</span>
							<span class="room-unit">{saved.unit}</span>
							<span class="room-date">{formatDate(saved.lastUsed)}</span>
						</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="new-session">
			<button class="primary" onclick={handleCreate} disabled={userName.trim().length === 0}>
				+ New Session
			</button>
			<button class="secondary" onclick={handleJoinMode} disabled={userName.trim().length === 0}>
				Join by Code
			</button>
		</div>
	{:else if mode === 'create'}
		<div class="room-info">
			<p>Share this code with your team:</p>
			<div class="room-code-large">{roomId}</div>
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
		min-height: 100vh;
		padding: 48px 24px;
		gap: 20px;
		box-sizing: border-box;
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
		margin: 0 0 8px;
		font-size: 1.3rem;
	}

	.name-bar {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	label {
		font-size: 1.1rem;
		color: #8a8070;
	}

	/* --- Room cards grid --- */

	.rooms {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 14px;
		width: 100%;
		max-width: 660px;
		margin-top: 4px;
	}

	.room-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px 18px 14px;
		border: 2px dashed #c0b89a;
		border-radius: 5px;
		background: rgba(245, 240, 230, 0.55);
		font-family: 'Caveat', cursive;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			box-shadow 0.15s;
		text-align: left;
		color: #3a3530;
		min-height: 90px;
	}

	.room-card:hover:not(.disabled) {
		background: rgba(59, 125, 216, 0.1);
		border-color: #8a9ab0;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}

	.room-card.disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.room-name {
		font-size: 1.35rem;
		font-weight: 700;
		color: #3a3530;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		padding-right: 20px;
	}

	.room-peers {
		font-size: 1.05rem;
		color: #7a7060;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.room-footer {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: auto;
		font-size: 0.9rem;
		color: #a09880;
	}

	.room-code {
		font-weight: 700;
		letter-spacing: 0.12em;
		color: #2a5090;
	}

	.room-unit {
		flex-shrink: 0;
	}

	.room-date {
		margin-left: auto;
		flex-shrink: 0;
	}

	.room-delete {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 2px 6px;
		border: none;
		background: transparent;
		font-size: 1.1rem;
		color: #c0b89a;
		cursor: pointer;
		font-family: 'Caveat', cursive;
		line-height: 1;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.room-card:hover .room-delete {
		opacity: 1;
	}

	.room-delete:hover {
		color: #b56b6b;
	}

	/* --- New session actions --- */

	.new-session {
		display: flex;
		gap: 12px;
		margin-top: 4px;
	}

	.room-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.room-code-large {
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
