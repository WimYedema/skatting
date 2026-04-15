<script lang="ts">
	import { generateRoomId } from '../lib/config'
	import type { RoomState, PrepDoneSignal } from '../lib/nostr-state'
	import {
		deleteSession,
		getLastUserName,
		getSavedSessions,
		type SavedSession,
	} from '../lib/session-store'

	interface Props {
		onJoin: (roomId: string, userName: string, unit: string | null) => void
		queryRoomState?: (roomCode: string) => Promise<RoomState | null>
		queryPrepDone?: (roomCode: string) => Promise<PrepDoneSignal[]>
	}

	let { onJoin, queryRoomState, queryPrepDone }: Props = $props()

	let roomId = $state('')
	let userName = $state(getLastUserName())
	let unit = $state('points')
	let mode = $state<'choose' | 'create' | 'join' | 'rejoin'>('choose')
	let recentSessions = $state(getSavedSessions())
	let selectedSession = $state<SavedSession | null>(null)
	// Deduplicate by roomId for display — show the most recent per room
	let displaySessions = $derived(
		recentSessions.filter((s, i) => recentSessions.findIndex((r) => r.roomId === s.roomId) === i)
	)

	// Join preview state
	let roomPreview = $state<{ roomState: RoomState | null; prepDone: PrepDoneSignal[]; knownNames: KnownName[] } | null>(null)
	let loadingPreview = $state(false)

	interface KnownName {
		name: string
		isCreator: boolean
		ticketCount?: number
	}

	function buildKnownNames(roomState: RoomState | null, prepDone: PrepDoneSignal[], roomCode: string): KnownName[] {
		const nameMap = new Map<string, KnownName>()
		// From saved sessions for this room
		const saved = recentSessions.filter((s) => s.roomId === roomCode)
		for (const s of saved) {
			if (s.isCreator) {
				nameMap.set(s.userName.toLowerCase(), { name: s.userName, isCreator: true })
			}
			for (const pn of s.peerNames ?? []) {
				if (!nameMap.has(pn.toLowerCase())) {
					nameMap.set(pn.toLowerCase(), { name: pn, isCreator: false })
				}
			}
		}
		// From prep-done signals (override with richer data)
		for (const pd of prepDone) {
			const existing = nameMap.get(pd.name.toLowerCase())
			nameMap.set(pd.name.toLowerCase(), {
				name: pd.name,
				isCreator: existing?.isCreator ?? false,
				ticketCount: pd.ticketCount,
			})
		}
		return Array.from(nameMap.values())
	}

	async function handleLookup() {
		if (!queryRoomState || !queryPrepDone) return
		const code = roomId.trim().toLowerCase()
		if (code.length < 4) return
		loadingPreview = true
		try {
			const [roomState, prepDone] = await Promise.all([
				queryRoomState(code),
				queryPrepDone(code),
			])
			const knownNames = buildKnownNames(roomState, prepDone, code)
			roomPreview = { roomState, prepDone, knownNames }
		} catch {
			// Query failed — fall back to direct join
			roomPreview = { roomState: null, prepDone: [], knownNames: buildKnownNames(null, [], code) }
		}
		loadingPreview = false
	}

	function handleCreate() {
		roomId = generateRoomId()
		mode = 'create'
	}

	function handleJoinMode() {
		roomId = ''
		roomPreview = null
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
		selectedSession = saved
		roomId = saved.roomId
		// Pre-fill with last used name if we have one
		userName = getLastUserName() || saved.userName
		// Build known names from saved session data immediately
		const knownNames = buildKnownNames(null, [], saved.roomId)
		roomPreview = { roomState: null, prepDone: [], knownNames }
		mode = 'rejoin'
		// Fire off Nostr lookup to enrich with live data
		if (queryRoomState && queryPrepDone) {
			loadingPreview = true
			Promise.all([queryRoomState(saved.roomId), queryPrepDone(saved.roomId)])
				.then(([roomState, prepDone]) => {
					const enriched = buildKnownNames(roomState, prepDone, saved.roomId)
					roomPreview = { roomState, prepDone, knownNames: enriched }
				})
				.catch(() => {
					// Keep local data on failure
				})
				.finally(() => {
					loadingPreview = false
				})
		}
	}

	function submitRejoin() {
		if (!selectedSession) return
		const trimmedName = userName.trim()
		if (!trimmedName) return
		// Check if this name matches a creator entry
		const match = recentSessions.find(
			(s) => s.roomId === selectedSession!.roomId && s.userName === trimmedName,
		)
		const selectedUnit = match?.isCreator ? match.unit : null
		onJoin(selectedSession.roomId, trimmedName, selectedUnit)
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

{#snippet roomStatePreview(rs: import('../lib/nostr-state').RoomState)}
	<div class="session-preview">
		{#if rs.topic}
			<span class="preview-topic">{rs.topic}</span>
		{/if}
		<span class="preview-meta">
			{rs.backlog.length} tickets · {rs.unit}
			{#if rs.prepMode} · prep mode{:else} · meeting{/if}
		</span>
	</div>
{/snippet}

{#snippet namePicker(names: KnownName[])}
	{#if names.length > 0}
		<div class="name-picker">
			<p>Who are you?</p>
			<div class="name-pills">
				{#each names as kn}
					<button
						class="name-pill"
						class:selected={userName.trim().toLowerCase() === kn.name.toLowerCase()}
						onclick={() => { userName = kn.name }}
					>
						{kn.name}
						{#if kn.isCreator}<span class="pill-creator">✎</span>{/if}
						{#if kn.ticketCount != null}<span class="pill-count">{kn.ticketCount}</span>{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
	<input
		type="text"
		bind:value={userName}
		placeholder="or type a new name"
		maxlength="30"
	/>
{/snippet}

<div class="lobby">
	<h1 class="logo">
		<svg class="logo-bg" viewBox="0 0 660 118" aria-hidden="true">
			<defs>
				<clipPath id="torn-clip">
					<path d="M0,0 L660,0 L660,104
						L656,106 L652,103 L648,107 L643,104 L638,108 L633,105 L628,107 L623,103
						L618,106 L613,104 L608,108 L603,105 L598,107 L593,104 L588,106 L583,103
						L578,107 L573,105 L568,108 L563,104 L558,106 L553,103 L548,107 L543,105
						L538,108 L533,104 L528,106 L523,103 L518,107 L513,105 L508,108 L503,104
						L498,106 L493,103 L488,107 L483,105 L478,108 L473,104 L468,106 L463,103
						L458,107 L453,105 L448,108 L443,104 L438,106 L433,103 L428,107 L423,105
						L418,108 L413,104 L408,106 L403,103 L398,107 L393,105 L388,108 L383,104
						L378,106 L373,103 L368,107 L363,105 L358,108 L353,104 L348,106 L343,103
						L338,107 L333,105 L328,108 L323,104 L318,106 L313,103 L308,107 L303,105
						L298,108 L293,104 L288,106 L283,103 L278,107 L273,105 L268,108 L263,104
						L258,106 L253,103 L248,107 L243,105 L238,108 L233,104 L228,106 L223,103
						L218,107 L213,105 L208,108 L203,104 L198,106 L193,103 L188,107 L183,105
						L178,108 L173,104 L168,106 L163,103 L158,107 L153,105 L148,108 L143,104
						L138,106 L133,103 L128,107 L123,105 L118,108 L113,104 L108,106 L103,103
						L98,107 L93,105 L88,108 L83,104 L78,106 L73,103 L68,107 L63,105
						L58,108 L53,104 L48,106 L43,103 L38,107 L33,105 L28,108 L23,104
						L18,106 L13,103 L8,107 L4,104 L0,105 Z"/>
				</clipPath>
				<filter id="paper-shadow" x="-1%" y="-2%" width="102%" height="116%">
					<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#8a8070" flood-opacity="0.18"/>
				</filter>
				<pattern id="hatch-lobby" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
					<line x1="0" y1="0" x2="0" y2="3" stroke="#5a5040" stroke-width="0.7"/>
				</pattern>
				<pattern id="hatch-red" width="2.5" height="2.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
					<line x1="0" y1="0" x2="0" y2="2.5" stroke="#b04040" stroke-width="0.6"/>
				</pattern>
			</defs>
			<g filter="url(#paper-shadow)">
				<g clip-path="url(#torn-clip)">
					<rect width="660" height="110" fill="#f5f0e6"/>
					<!-- Ruled lines -->
					<line x1="0" y1="22" x2="660" y2="22" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
					<line x1="0" y1="44" x2="660" y2="44" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
					<line x1="0" y1="66" x2="660" y2="66" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
					<line x1="0" y1="88" x2="660" y2="88" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
					<!-- Red margin line -->
					<line x1="28" y1="0" x2="28" y2="110" stroke="rgba(200,120,120,0.3)" stroke-width="0.8"/>
				</g>
			</g>
			<!-- Lognormal curve -->
			<path d="M256,76 C270,76 284,73 298,60 C308,50 314,38 324,32 C340,22 364,34 392,56 C404,66 414,74 420,77"
				fill="none" stroke="rgba(91,123,154,0.25)" stroke-width="1.8" stroke-linecap="round"/>
			<!-- Pompebled (official Frisian seeblatt shape) -->
			<g transform="translate(580, 38) scale(0.7)" opacity="0.35">
				<path d="M0,12A16.143,16.143 0 0,1 -14,-4A7,8 0 0,1 -7,-12A6,8 0 0,1 -1,-5A1,1 0 1,0 1,-5A6,8 0 0,1 7,-12A7,8 0 0,1 14,-4A16.143,16.143 0 0,1 0,12z"
					fill="url(#hatch-red)" stroke="#b04040" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"
					transform="rotate(35)"/>
			</g>
			<!-- Hatched text -->
			<text x="330" y="64" text-anchor="middle" font-family="Caveat, cursive" font-size="54" font-weight="700"
				fill="url(#hatch-lobby)" stroke="#5a5040" stroke-width="0.6" letter-spacing="2">Skatting</text>
			<!-- Subtitle -->
			<text x="330" y="96" text-anchor="middle" font-family="Caveat, cursive" font-size="18"
				fill="#8a8070">estimate with uncertainty</text>
		</svg>
	</h1>

	{#if mode === 'choose'}
		{#if displaySessions.length > 0}
			<div class="rooms">
				{#each displaySessions as saved (saved.roomId)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="room-card"
						onclick={() => handleRejoin(saved)}
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
			<button class="primary" onclick={handleCreate}>
				+ New Session
			</button>
			<button class="secondary" onclick={handleJoinMode}>
				Join by Code
			</button>
		</div>
	{:else if mode === 'create'}
		<div class="room-info">
			<p>Share this code with your team:</p>
			<div class="room-code-large">{roomId}</div>
			<div class="name-bar">
				<label for="create-name">Your name</label>
				<input
					id="create-name"
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
	{:else if mode === 'rejoin'}
		<div class="room-info">
			<div class="room-code-large">{roomId}</div>
			{#if roomPreview?.roomState}
				{@render roomStatePreview(roomPreview.roomState)}
			{:else if selectedSession}
				<div class="session-preview">
					{#if selectedSession.topic}
						<span class="preview-topic">{selectedSession.topic}</span>
					{/if}
					<span class="preview-meta">{selectedSession.unit}</span>
				</div>
			{/if}
			{#if loadingPreview}
				<span class="preview-loading">Loading session info…</span>
			{/if}
			{@render namePicker(roomPreview?.knownNames ?? [])}
			<button class="primary" onclick={submitRejoin} disabled={userName.trim().length === 0}>
				{#if userName.trim()}Join as {userName.trim()}{:else}Join{/if}
			</button>
			<button class="back" onclick={() => { mode = 'choose'; selectedSession = null; roomPreview = null }}>← Back</button>
		</div>
	{:else}
		<div class="room-info">
			{#if roomPreview}
				<div class="room-code-large">{roomId}</div>
				{#if roomPreview.roomState}
					{@render roomStatePreview(roomPreview.roomState)}
				{:else}
					<p class="preview-empty">No session data found — join anyway?</p>
				{/if}
				{@render namePicker(roomPreview.knownNames)}
				<button class="primary" onclick={handleSubmit} disabled={!canSubmit}>
					{#if userName.trim() && roomPreview.knownNames.some((kn) => kn.name.toLowerCase() === userName.trim().toLowerCase())}Join as {userName.trim()}{:else}Join{/if}
				</button>
				<button class="back" onclick={() => { roomPreview = null }}>← Back</button>
			{:else}
				<p>Enter room code:</p>
				<input
					type="text"
					bind:value={roomId}
					placeholder="e.g. bakitume"
					maxlength="10"
					onkeydown={(e: KeyboardEvent) => {
						if (e.key === 'Enter') {
							if (queryRoomState && roomId.trim().length >= 4) { handleLookup() }
							else if (canSubmit) { handleSubmit() }
						}
					}}
				/>
				{#if loadingPreview}
					<span class="preview-loading">Looking up session…</span>
				{:else if queryRoomState && roomId.trim().length >= 4}
					<button class="secondary" onclick={handleLookup}>Look up session</button>
				{/if}
				<div class="name-bar">
					<label for="join-name">Your name</label>
					<input
						id="join-name"
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
				<button class="primary" onclick={handleSubmit} disabled={!canSubmit}>
					Join directly
				</button>
				<button class="back" onclick={() => (mode = 'choose')}>← Back</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.lobby {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		padding: 48px var(--sp-2xl);
		gap: var(--sp-xl);
		box-sizing: border-box;
	}

	h1, .logo {
		margin: 0;
		line-height: 0;
		width: 100%;
		max-width: 660px;
	}

	.logo-bg {
		width: 100%;
		height: auto;
	}

	.name-bar {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	label {
		font-size: var(--fs-lg);
		color: var(--c-text-muted);
	}

	/* --- Room cards grid --- */

	.rooms {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 14px;
		width: 100%;
		max-width: 660px;
		margin-top: var(--sp-xs);
	}

	.room-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: var(--sp-lg) 18px 14px;
		border: 2px dashed var(--c-border);
		border-radius: 5px;
		background: rgba(245, 240, 230, 0.55);
		font-family: var(--font);
		cursor: pointer;
		transition:
			background var(--tr-fast),
			border-color var(--tr-fast),
			box-shadow var(--tr-fast);
		text-align: left;
		color: var(--c-text);
		min-height: 90px;
	}

	.room-card:hover:not(.disabled) {
		background: rgba(59, 125, 216, 0.1);
		border-color: var(--c-accent-border);
		box-shadow: var(--shadow-sm);
	}

	.room-name {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--c-text);
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		padding-right: var(--sp-xl);
	}

	.room-peers {
		font-size: var(--fs-md);
		color: #7a7060;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.room-footer {
		display: flex;
		align-items: baseline;
		gap: var(--sp-sm);
		margin-top: auto;
		font-size: 0.9rem;
		color: var(--c-text-faint);
	}

	.room-code {
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--c-accent-text);
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
		font-size: var(--fs-lg);
		color: var(--c-border);
		cursor: pointer;
		font-family: var(--font);
		line-height: 1;
		opacity: 0;
		transition: opacity var(--tr-fast);
	}

	.room-card:hover .room-delete {
		opacity: 1;
	}

	.room-delete:hover {
		color: var(--c-red-border);
	}

	/* --- New session actions --- */

	.new-session {
		display: flex;
		gap: var(--sp-md);
		margin-top: var(--sp-xs);
	}

	.room-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-md);
	}

	.room-code-large {
		font-size: 3rem;
		font-family: var(--font);
		letter-spacing: 0.3em;
		background: rgba(210, 200, 180, 0.4);
		padding: var(--sp-md) 32px;
		border: 2px dashed var(--c-border-soft);
		border-radius: var(--radius-sm);
		user-select: all;
		color: var(--c-text);
	}

	.unit-picker {
		display: flex;
		align-items: center;
		gap: var(--sp-sm);
		font-size: 1.2rem;
	}

	.unit-picker select {
		font-family: var(--font);
		font-size: 1.2rem;
		padding: var(--sp-xs) var(--sp-sm);
		border: 2px dashed var(--c-border);
		border-radius: var(--radius-sm);
		background: rgba(245, 240, 230, 0.5);
		color: var(--c-text);
		cursor: pointer;
	}

	input {
		font-family: var(--font);
		font-size: var(--fs-3xl);
		text-align: center;
		letter-spacing: 0.15em;
		padding: var(--sp-sm) var(--sp-xl);
		border: 2px dashed var(--c-border);
		border-radius: var(--radius-sm);
		background: rgba(245, 240, 230, 0.5);
		color: var(--c-text);
		outline: none;
		width: 220px;
	}

	input:focus {
		border-color: var(--c-accent);
	}

	input::placeholder {
		color: var(--c-text-faint);
	}

	button {
		padding: 10px 28px;
		border: 1px dashed var(--c-accent-border);
		border-radius: var(--radius-sm);
		font-family: var(--font);
		font-size: var(--fs-xl);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--tr-fast);
	}

	.primary {
		background: var(--c-accent-bg);
		color: var(--c-accent-text);
	}

	.primary:hover {
		background: var(--c-accent-bg-hover);
	}

	.primary:disabled {
		background: rgba(160, 150, 130, 0.2);
		border-color: var(--c-border);
		cursor: not-allowed;
		color: var(--c-text-faint);
	}

	.secondary {
		background: rgba(160, 150, 130, 0.2);
		color: #5a5040;
		border-color: var(--c-border-soft);
	}

	.secondary:hover {
		background: rgba(160, 150, 130, 0.35);
	}

	.back {
		background: transparent;
		color: var(--c-text-muted);
		font-size: var(--fs-base);
		border-color: transparent;
	}

	.back:hover {
		color: var(--c-text);
	}

	/* --- Join preview --- */

	.session-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-xs);
	}

	.preview-topic {
		font-size: var(--fs-xl);
		font-weight: 700;
		color: var(--c-text);
	}

	.preview-meta {
		font-size: var(--fs-base);
		color: var(--c-text-muted);
	}

	.preview-empty {
		color: var(--c-text-ghost);
		font-style: italic;
	}

	.preview-loading {
		color: var(--c-text-muted);
		font-style: italic;
		font-size: var(--fs-base);
	}

	.name-picker {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-sm);
	}

	.name-picker p {
		margin: 0;
		color: var(--c-text-muted);
		font-size: var(--fs-base);
	}

	.name-pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-sm);
		justify-content: center;
	}

	.name-pill {
		padding: 6px var(--sp-lg);
		border: 2px dashed var(--c-border);
		border-radius: var(--radius-lg);
		background: rgba(245, 240, 230, 0.55);
		font-family: var(--font);
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--c-text);
		cursor: pointer;
		transition: background var(--tr-fast), border-color var(--tr-fast);
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.name-pill:hover {
		background: rgba(59, 125, 216, 0.12);
		border-color: var(--c-accent-border);
	}

	.name-pill.selected {
		background: var(--c-accent-bg);
		border-color: var(--c-accent);
		color: var(--c-accent-text);
	}

	.pill-creator {
		font-size: 0.85em;
		color: var(--c-warm);
	}

	.pill-count {
		font-size: 0.8em;
		color: #7a9a6a;
		background: rgba(90, 140, 80, 0.12);
		padding: 1px 6px;
		border-radius: 10px;
	}
</style>
