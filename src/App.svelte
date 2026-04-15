<script lang="ts">
	import BacklogPanel from './components/BacklogPanel.svelte'
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import Onboarding from './components/Onboarding.svelte'
	import SessionLobby from './components/SessionLobby.svelte'
	import { parseCsv, exportToCsv, exportToXls, downloadFile } from './lib/csv'
	import type { ImportedTicket } from './lib/types'
	import {
		generateSessionKeys,
		publishRoomState,
		publishPrepDone,
		queryRoomState,
		queryPrepDone,
	} from './lib/nostr-state'
	import { createSession, getPeerColor, selfId } from './lib/peer'
	import { saveSession, createScopedStorage } from './lib/session-store'
	import {
		createInitialState,
		getCurrentTicket,
		getEstimatedCount,
		getAllParticipants,
		getReadyCount,
		getAllReady,
		handleEstimateChange,
		handleDone,
		handleAbstain,
		handleTopicChange,
		handleForceReveal,
		handleNext,
		selectTicket,
		processBacklogImport,
		mergeBacklogImport,
		handleReorder,
		handleRemove,
		startMeeting,
		returnToPrep,
		reEstimate,
		changeUnit,
		checkAutoReveal,
		prepareJoin,
		applyNostrState,
		connectSession,
		leaveSession,
		type SessionDeps,
	} from './lib/session-controller'

	let s = $state(createInitialState())

	const ONBOARDING_KEY = 'estimate-onboarded'
	let showOnboarding = $state(false)
	let pendingImport = $state<ImportedTicket[] | null>(null)

	function dismissOnboarding() {
		showOnboarding = false
		localStorage.setItem(ONBOARDING_KEY, '1')
	}

	const deps: SessionDeps = {
		selfId,
		createSession,
		saveSession,
		createScopedStorage,
		generateSessionKeys,
		publishRoomState,
		publishPrepDone,
		queryRoomState,
		queryPrepDone,
	}

	async function handleJoin(roomId: string, name: string, selectedUnit: string | null) {
		prepareJoin(s, deps, roomId, name, selectedUnit)
		try {
			const [roomState, prepDone] = await Promise.all([
				queryRoomState(roomId),
				queryPrepDone(roomId),
			])
			applyNostrState(s, roomState, prepDone)
		} catch {
			// Nostr query failure is non-fatal — proceed with P2P
		}
		connectSession(s, deps, roomId)
		// Show onboarding on first-ever session
		if (!localStorage.getItem(ONBOARDING_KEY)) {
			showOnboarding = true
		}
	}

	// Derived values
	let currentTicket = $derived(getCurrentTicket(s))
	let estimatedCount = $derived(getEstimatedCount(s))
	let peerEstimates = $derived(
		Array.from(s.peerEstimateMap.values())
			.filter((pe) => !s.abstainedPeers.has(pe.peerId))
			.map((pe) => ({
				mu: pe.mu,
				sigma: pe.sigma,
				color: getPeerColor(pe.peerId, s.peerIds),
				name: s.peerNames.get(pe.peerId) ?? 'Peer',
			})),
	)
	let allParticipants = $derived(getAllParticipants(s, selfId))
	let readyCount = $derived(getReadyCount(s, selfId))
	let allReady = $derived(getAllReady(s, selfId))

	// Auto-reveal when everyone has placed their estimate (meeting mode only)
	$effect(() => {
		checkAutoReveal(s, allReady)
	})

	// CSV import handler (file-reading stays in component)
	function handleBacklogImport(file: File) {
		const reader = new FileReader()
		reader.onload = () => {
			const text = reader.result as string
			const tickets = parseCsv(text)
			if (tickets.length === 0) return
			if (s.backlog.length > 0) {
				pendingImport = tickets
			} else {
				processBacklogImport(s, deps, tickets)
			}
		}
		reader.readAsText(file)
	}

	function handleImportReplace() {
		if (pendingImport) processBacklogImport(s, deps, pendingImport)
		pendingImport = null
	}

	function handleImportMerge() {
		if (pendingImport) mergeBacklogImport(s, deps, pendingImport)
		pendingImport = null
	}

	function handleExportCsv() {
		const csv = exportToCsv(s.backlog)
		const timestamp = new Date().toISOString().slice(0, 10)
		downloadFile(csv, `estimates-${timestamp}.csv`, 'text/csv')
	}

	function handleExportExcel() {
		const xls = exportToXls(s.backlog)
		const timestamp = new Date().toISOString().slice(0, 10)
		downloadFile(xls, `estimates-${timestamp}.xls`, 'application/vnd.ms-excel')
	}
</script>

{#if !s.session}
	<SessionLobby onJoin={handleJoin} />
{:else}
	<main style:padding-right="{s.backlog.length > 0 ? '276px' : '16px'}">
		<header>
			<div class="header-left">
				<h1 class="logo">
				<svg class="logo-bg" viewBox="0 0 180 48" aria-hidden="true">
					<rect width="180" height="48" fill="#f5f0e6" rx="2"/>
					<!-- Ruled lines -->
					<line x1="0" y1="12" x2="180" y2="12" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
					<line x1="0" y1="24" x2="180" y2="24" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
					<line x1="0" y1="36" x2="180" y2="36" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
					<!-- Red margin line -->
					<line x1="10" y1="0" x2="10" y2="48" stroke="rgba(200,120,120,0.3)" stroke-width="0.8"/>
					<!-- Axes -->
					<line x1="24" y1="42" x2="170" y2="42" stroke="#5a5040" stroke-width="0.8"/>
					<line x1="24" y1="8" x2="24" y2="42" stroke="#5a5040" stroke-width="0.8"/>
					<!-- Lognormal curve -->
					<path d="M28,41 C38,41 48,39 58,32 C65,27 70,20 78,16 C90,11 108,18 128,30 C142,38 156,41 170,42"
						fill="none" stroke="rgba(91,123,154,0.3)" stroke-width="1.2" stroke-linecap="round"/>
				</svg>
				<span class="logo-text">Skatting</span>
			</h1>
				<span class="room-badge" role="button" tabindex="0" title="Copy room code" data-tour="room" onclick={() => navigator.clipboard.writeText(s.session!.roomId)}>{s.session.roomId} <span class="copy-icon">⎘</span></span>
				{#if s.isCreator && estimatedCount === 0 && s.history.length === 0}
					<select class="unit-select" value={s.unit} onchange={(e) => changeUnit(s, (e.target as HTMLSelectElement).value)}>
						<option value="points">points</option>
						<option value="days">days</option>
					</select>
				{:else}
					<span class="unit-badge">{s.unit}</span>
				{/if}
				{#if s.topicUrl}
					<a
						class="topic-link"
						href={s.topicUrl}
						target="_blank"
						rel="noopener noreferrer"
						title={s.topicUrl}
					>
						{s.topic || s.topicUrl}
					</a>
				{:else}
					<input
						class="topic-input"
						type="text"
						bind:value={s.topic}
						placeholder="Session name…"
						maxlength="100"
						onchange={() => handleTopicChange(s, deps)}
					/>
				{/if}
			</div>
			<div class="header-center">
				{#if s.isCreator}
					<label class="import-label">
						<input
							type="file"
							accept=".csv"
							class="file-input"
							onchange={(e) => {
								const file = (e.target as HTMLInputElement).files?.[0]
								if (file) handleBacklogImport(file)
								;(e.target as HTMLInputElement).value = ''
							}}
						/>
						📋 Import CSV
					</label>
				{/if}
				<button
					class="past-toggle"
					class:past-active={s.showPersistentHistory}
					onclick={() => (s.showPersistentHistory = !s.showPersistentHistory)}
				>
					{s.showPersistentHistory ? '↩ Hide past' : '↪ Show past'}
				</button>
			</div>
			<div class="header-right">
				{#if s.prepMode}
					<button class="next" onclick={() => handleNext(s, deps)}>
						{s.backlogIndex < s.backlog.length - 1 ? 'Next issue →' : 'Finish ✓'}
					</button>
					{#if s.isCreator}
						<button class="mode-toggle" onclick={() => startMeeting(s, deps)}>Start meeting</button>
					{/if}
				{:else if s.revealed}
					<button class="next" onclick={() => handleNext(s, deps)}>
						{s.backlog.length > 0 && s.backlogIndex < s.backlog.length - 1 ? 'Next issue →' : 'Next →'}
					</button>
					{#if s.isCreator}
						<button class="mode-toggle" onclick={() => reEstimate(s)}>Re-estimate ↺</button>
					{/if}
				{:else if !s.selfReady}
					<button class="done" data-tour="ready" onclick={() => handleDone(s)}>Ready ✓</button>
				{:else if !allReady}
					<button class="force-reveal" onclick={() => handleForceReveal(s)}>Reveal anyway</button>
				{/if}
				{#if !s.prepMode && s.isCreator && s.backlog.length > 0}
					<button class="mode-toggle" onclick={() => returnToPrep(s)}>Back to prep</button>
				{/if}
				<button class="leave" onclick={() => leaveSession(s)}>Leave</button>
				<button class="help-btn" title="How does this work?" onclick={() => (showOnboarding = true)}>?</button>
			</div>
		</header>

		{#if s.connectionError}
			<div class="connection-error">
				{s.connectionError}
				<button onclick={() => (s.connectionError = '')}>×</button>
			</div>
		{/if}

		<div class="participants">
			<div class="participant" class:is-ready={s.selfReady}>
				<span class="ready-dot" class:ready={s.selfReady}></span>
				<span class="name">{s.userName} (you){#if s.selfAbstained} <span class="abstain-tag">🤷</span>{/if}{#if s.isCreator}<span class="leader-tag"> ✎ in charge</span>{/if}</span>
			</div>
			{#each s.peerIds as peerId}
				<div class="participant" class:is-ready={s.readyPeers.has(peerId)}>
					<span
						class="ready-dot"
						class:ready={s.readyPeers.has(peerId)}
						style="--peer-color: {getPeerColor(peerId, s.peerIds)}"
					></span>
					<span class="name">{s.peerNames.get(peerId) ?? 'Connecting…'}{#if s.abstainedPeers.has(peerId)} <span class="abstain-tag">🤷</span>{/if}{#if peerId === s.creatorPeerId}<span class="leader-tag"> ✎ in charge</span>{/if}</span>
				</div>
			{/each}
			<span class="ready-count">{readyCount}/{allParticipants.length} ready</span>
			{#if s.prepMode && s.prepDone.length > 0}
				<span class="prep-done-divider">│</span>
				{#each s.prepDone as signal}
					<span class="prep-done-signal" title="{signal.name} prepped {signal.ticketCount} tickets">
						<span class="prep-done-dot"></span>
						{signal.name} <span class="prep-done-count">({signal.ticketCount})</span>
					</span>
				{/each}
			{/if}
		</div>

		<EstimationCanvas
			mu={s.mu}
			sigma={s.sigma}
			{peerEstimates}
			revealed={s.revealed}
			userName={s.userName}
			history={s.history}
			persistentHistory={s.showPersistentHistory ? s.persistentHistory : []}
			unit={s.unit}
			{currentTicket}
			onEstimateChange={(mu, sigma) => handleEstimateChange(s, mu, sigma)}
			dataTour="canvas"
			selfAbstained={s.selfAbstained}
			showAbstainButton={!s.selfReady && !s.revealed}
			onAbstain={() => handleAbstain(s)}
		/>

		{#if s.backlog.length > 0}
			<BacklogPanel
				tickets={s.backlog}
				currentIndex={s.backlogIndex}
				isCreator={s.isCreator}
				prepMode={s.prepMode}
				myEstimates={s.myEstimates}
				{estimatedCount}
				onSelect={(index) => {
					if (s.isCreator || s.prepMode) selectTicket(s, index)
				}}
				onReorder={(from, to) => handleReorder(s, deps, from, to)}
				onRemove={(index) => handleRemove(s, deps, index)}
				onExportCsv={handleExportCsv}
				onExportExcel={handleExportExcel}
			/>
		{/if}
	</main>
	{#if s.showSummary}
		<div class="summary-overlay" role="dialog" aria-label="Session summary">
			<div class="summary-panel">
				<h2>Session Summary</h2>
				<table class="summary-table">
					<thead>
						<tr>
							<th>ID</th>
							<th>Title</th>
							<th>Estimate</th>
						</tr>
					</thead>
					<tbody>
						{#each s.backlog as ticket}
							<tr class:unestimated={ticket.median == null}>
								<td class="summary-id">{ticket.id}</td>
								<td class="summary-title">{ticket.title}</td>
								<td class="summary-verdict">
									{ticket.median != null ? `${ticket.median.toFixed(1)} ${s.unit}` : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="summary-actions">
					<button class="export" onclick={handleExportCsv}>Export CSV ↓</button>
					<button class="export" onclick={handleExportExcel}>Export Excel ↓</button>
					<button class="summary-close" onclick={() => (s.showSummary = false)}>Back to session</button>
				</div>
			</div>
		</div>
	{/if}
	{#if showOnboarding}
		<Onboarding userName={s.userName} onDismiss={dismissOnboarding} />
	{/if}
	{#if pendingImport}
		<div class="summary-overlay" role="dialog" aria-label="Import backlog">
			<div class="import-confirm">
				<h2>You already have a backlog</h2>
				<p>{s.backlog.length} tickets loaded — importing {pendingImport.length} new ones.</p>
				<div class="import-actions">
					<button class="primary" onclick={handleImportMerge}>Merge (add new)</button>
					<button class="danger" onclick={handleImportReplace}>Replace all</button>
					<button class="secondary" onclick={() => (pendingImport = null)}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	:global(body) {
		margin: 0;
		font-family: 'Caveat', cursive;
		background: #e8e0d0;
		color: #3a3530;
	}

	main {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 16px;
		box-sizing: border-box;
		gap: 12px;
		transition: padding-right 0.2s;
	}

	header {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}

	.header-center {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	h1, .logo {
		margin: 0;
		position: relative;
		white-space: nowrap;
		line-height: 1;
	}

	.logo-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.logo-text {
		position: relative;
		font-family: 'Caveat', cursive;
		font-size: 1.8rem;
		font-weight: 700;
		color: #3a3530;
		padding: 4px 12px 4px 20px;
	}

	.topic-input {
		background: transparent;
		border: 1px dashed transparent;
		border-radius: 2px;
		color: #3a3530;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		font-weight: 600;
		padding: 2px 6px;
		flex: 1;
		min-width: 80px;
		outline: none;
	}

	.topic-input::placeholder {
		color: #a09880;
		font-style: italic;
	}

	.topic-input:hover {
		border-color: #c0b89a;
	}

	.topic-input:focus {
		border-color: #3b7dd8;
		background: rgba(245, 240, 230, 0.6);
	}

	.connection-error {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: rgba(181, 107, 107, 0.2);
		border: 1px dashed #b56b6b;
		border-radius: 3px;
		color: #7a3030;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		padding: 8px 16px;
		margin: 0 16px;
	}

	.connection-error button {
		background: none;
		border: none;
		color: #7a3030;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 4px;
	}

	.room-badge {
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		background: rgba(210, 200, 180, 0.5);
		padding: 2px 10px;
		border-radius: 3px;
		border: 1px dashed #b0a890;
		color: #3a3530;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: background 0.15s;
	}

	.room-badge:hover {
		background: rgba(210, 200, 180, 0.7);
	}

	.copy-icon {
		opacity: 0.4;
		font-size: 0.9em;
		transition: opacity 0.15s;
	}

	.room-badge:hover .copy-icon {
		opacity: 0.8;
	}

	.unit-select {
		font-family: 'Caveat', cursive;
		font-size: 0.95rem;
		background: rgba(210, 200, 180, 0.3);
		border: 1px dashed #c0b89a;
		border-radius: 3px;
		padding: 1px 4px;
		color: #6a6050;
		cursor: pointer;
	}

	.unit-badge {
		font-family: 'Caveat', cursive;
		font-size: 0.95rem;
		color: #8a8070;
	}

	.participants {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		background: rgba(210, 200, 180, 0.35);
		border: 1px dashed #c0b89a;
		border-radius: 3px;
		font-size: 1rem;
		flex-wrap: wrap;
	}

	.participant {
		display: flex;
		align-items: center;
		gap: 5px;
		color: #8a8070;
		transition: color 0.2s;
	}

	.participant.is-ready {
		color: #3a3530;
	}

	.ready-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #c0b89a;
		transition: background 0.3s;
	}

	.ready-dot.ready {
		background: var(--peer-color, #22c55e);
	}

	.name {
		white-space: nowrap;
	}

	.ready-count {
		margin-left: auto;
		color: #9a9080;
		font-size: 0.85rem;
	}

	.prep-done-divider {
		color: #c0b89a;
		font-size: 0.85rem;
	}

	.prep-done-signal {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #5a8a5a;
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.prep-done-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #7aaa6a;
	}

	.prep-done-count {
		color: #8a9a80;
		font-size: 0.8rem;
	}

	button {
		padding: 8px 20px;
		border: 1px dashed #8a9ab0;
		border-radius: 3px;
		background: rgba(59, 125, 216, 0.2);
		color: #2a5090;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	button:hover {
		background: rgba(59, 125, 216, 0.35);
	}

	.leave {
		background: rgba(160, 150, 130, 0.25);
		border-color: #b0a890;
		color: #6a6050;
	}

	.leave:hover {
		background: rgba(160, 150, 130, 0.4);
	}

	.help-btn {
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px dashed #b0a890;
		border-radius: 50%;
		background: rgba(210, 200, 180, 0.2);
		color: #9a9080;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		font-weight: 700;
		cursor: pointer;
		line-height: 1;
		transition: background 0.15s, color 0.15s;
	}

	.help-btn:hover {
		background: rgba(210, 200, 180, 0.45);
		color: #5a5040;
	}

	.past-toggle {
		padding: 4px 12px;
		border: 1px dashed #b0a890;
		border-radius: 3px;
		background: rgba(210, 200, 180, 0.15);
		color: #9a9080;
		font-family: 'Caveat', cursive;
		font-size: 0.95rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
		white-space: nowrap;
	}

	.past-toggle:hover {
		background: rgba(210, 200, 180, 0.35);
		color: #6a6050;
	}

	.past-toggle.past-active {
		background: rgba(210, 200, 180, 0.4);
		color: #5a5040;
		border-style: solid;
	}

	.leader-tag {
		font-family: 'Caveat', cursive;
		font-size: 0.85em;
		color: #8a7a60;
		font-style: italic;
	}

	.abstain-tag {
		font-size: 0.85em;
	}

	.next {
		background: rgba(90, 140, 80, 0.2);
		border-color: #8aaa7a;
		color: #4a6a40;
	}

	.next:hover {
		background: rgba(90, 140, 80, 0.35);
	}

	.done {
		background: rgba(59, 125, 216, 0.2);
		border-color: #8aaacc;
		color: #2a5090;
	}

	.done:hover {
		background: rgba(59, 125, 216, 0.35);
	}

	.force-reveal {
		background: rgba(180, 140, 60, 0.15);
		border-color: #c0a870;
		color: #8a7040;
		font-size: 0.95rem;
	}

	.force-reveal:hover {
		background: rgba(180, 140, 60, 0.3);
	}

	.mode-toggle {
		background: rgba(90, 140, 80, 0.15);
		border-color: #8aaa7a;
		color: #4a6a40;
		font-size: 0.9rem;
		padding: 6px 14px;
	}

	.mode-toggle:hover {
		background: rgba(90, 140, 80, 0.3);
	}

	.topic-link {
		color: #2a5090;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		font-weight: 600;
		text-decoration: underline;
		text-decoration-style: dashed;
		text-underline-offset: 3px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 50%;
	}

	.topic-link:hover {
		color: #3b7dd8;
	}

	.backlog-progress {
		font-size: 0.9rem;
		color: #6a6050;
		white-space: nowrap;
	}

	.export {
		background: rgba(90, 140, 80, 0.15);
		border-color: #8aaa7a;
		color: #4a6a40;
		font-size: 0.95rem;
	}

	.export:hover {
		background: rgba(90, 140, 80, 0.3);
	}

	.import-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border: 1px dashed #b0a890;
		border-radius: 3px;
		background: rgba(210, 200, 180, 0.25);
		color: #6a6050;
		font-family: 'Caveat', cursive;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
	}

	.import-label:hover {
		background: rgba(210, 200, 180, 0.45);
	}

	.file-input {
		display: none;
	}

	.summary-overlay {
		position: fixed;
		inset: 0;
		background: rgba(58, 53, 48, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
	}

	.summary-panel {
		background: #f0e8d8;
		border: 1px dashed #b0a890;
		border-radius: 6px;
		padding: 24px 32px;
		max-width: 640px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
	}

	.summary-panel h2 {
		margin: 0 0 16px;
		font-size: 1.6rem;
		font-weight: 700;
		color: #3a3530;
	}

	.summary-table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'Caveat', cursive;
		font-size: 1rem;
		margin-bottom: 20px;
	}

	.summary-table th {
		text-align: left;
		padding: 6px 10px;
		border-bottom: 1px dashed #b0a890;
		color: #8a8070;
		font-weight: 400;
		font-size: 0.9rem;
	}

	.summary-table td {
		padding: 6px 10px;
		border-bottom: 1px solid rgba(176, 168, 144, 0.2);
	}

	.summary-id {
		color: #8a8070;
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.summary-title {
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.summary-verdict {
		font-weight: 600;
		color: #4a6a40;
		white-space: nowrap;
	}

	tr.unestimated .summary-verdict {
		color: #a09880;
	}

	.summary-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
	}

	.summary-close {
		background: rgba(160, 150, 130, 0.25);
		border-color: #b0a890;
		color: #6a6050;
	}

	.summary-close:hover {
		background: rgba(160, 150, 130, 0.4);
	}

	.import-confirm {
		background: #f0e8d8;
		border: 1px dashed #b0a890;
		border-radius: 6px;
		padding: 24px 32px;
		max-width: 400px;
		font-family: 'Caveat', cursive;
		text-align: center;
	}

	.import-confirm h2 {
		margin: 0 0 8px;
		font-size: 1.4rem;
		color: #3a3530;
	}

	.import-confirm p {
		margin: 0 0 16px;
		font-size: 1.1rem;
		color: #6a6050;
	}

	.import-actions {
		display: flex;
		gap: 10px;
		justify-content: center;
	}

	.import-actions button {
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		padding: 6px 16px;
		border-radius: 4px;
		border: 1px dashed #b0a890;
		cursor: pointer;
	}

	.import-actions .primary {
		background: rgba(91, 123, 154, 0.25);
		color: #3a3530;
	}

	.import-actions .danger {
		background: rgba(180, 80, 60, 0.2);
		color: #8a3020;
		border-color: rgba(180, 80, 60, 0.4);
	}

	.import-actions .secondary {
		background: rgba(160, 150, 130, 0.2);
		color: #6a6050;
	}
</style>
