<script lang="ts">
	import BacklogPanel from './components/BacklogPanel.svelte'
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import ImportConfirmDialog from './components/ImportConfirmDialog.svelte'
	import ImportMenu from './components/ImportMenu.svelte'
	import Onboarding from './components/Onboarding.svelte'
	import ParticipantsList from './components/ParticipantsList.svelte'
	import PasteListModal from './components/PasteListModal.svelte'
	import SessionLobby from './components/SessionLobby.svelte'
	import SessionSummaryDialog from './components/SessionSummaryDialog.svelte'
	import { parseCsv, exportToCsv, exportToXls, downloadFile } from './lib/csv'
	import type { ImportedTicket } from './lib/types'
	import { convergenceState } from './lib/facilitation'
	import { combineEstimates, collectEstimates, snapVerdict } from './lib/lognormal'
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
		toggleLiveAdjust,
		changeUnit,
		checkAutoReveal,
		prepareJoin,
		applyNostrState,
		connectSession,
		leaveSession,
		skipPeer,
		getActiveParticipants,
		hasMic,
		handOffMic,
		takeMicBack,
		claimMic,
		type SessionDeps,
	} from './lib/session-controller'

	let s = $state(createInitialState())

	const ONBOARDING_KEY = 'estimate-onboarded'
	let showOnboarding = $state(false)
	let pendingImport = $state<ImportedTicket[] | null>(null)
	let connecting = $state(false)
	let missedRounds = $state(0)
	let showPasteModal = $state(false)
	let dragOver = $state(false)

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
		connecting = true
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
		connecting = false
		// Show onboarding on first-ever session
		if (!localStorage.getItem(ONBOARDING_KEY)) {
			showOnboarding = true
		}
		// Late joiner catch-up: count tickets with verdicts
		if (!s.isCreator && !s.prepMode) {
			missedRounds = s.backlog.filter((t) => t.median != null).length
		}
	}

	// Derived values
	let currentTicket = $derived(getCurrentTicket(s))
	let estimatedCount = $derived(getEstimatedCount(s))
	let holdsMic = $derived(hasMic(s, selfId))
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
	let activeCount = $derived(getActiveParticipants(s, selfId).length)
	let readyCount = $derived(getReadyCount(s, selfId))
	let allReady = $derived(getAllReady(s, selfId))
	let participantsData = $derived([
		{
			id: selfId,
			name: s.userName,
			color: '',
			isReady: s.selfReady,
			isSkipped: false,
			isAbstained: s.selfAbstained,
			hasMic: holdsMic,
			isLeader: s.isCreator,
			isSelf: true,
		},
		...s.peerIds.map((peerId) => ({
			id: peerId,
			name: s.peerNames.get(peerId) ?? 'Connecting…',
			color: getPeerColor(peerId, s.peerIds),
			isReady: s.readyPeers.has(peerId),
			isSkipped: s.skippedPeers.has(peerId),
			isAbstained: s.abstainedPeers.has(peerId),
			hasMic: s.micHolder === peerId,
			isLeader: peerId === s.creatorPeerId,
			isSelf: false,
		})),
	])

	// Convergence state for post-reveal facilitation
	let conclusionMode: number | null = $state(null)
	let conclusionSigma: number | null = $state(null)
	let combinedEstimate = $derived.by(() => {
		if (!s.revealed) return null
		return combineEstimates(collectEstimates({ mu: s.mu, sigma: s.sigma }, peerEstimates, s.selfAbstained))
	})
	let isConverged = $derived.by(() => {
		if (!combinedEstimate) return true
		const all = collectEstimates({ mu: s.mu, sigma: s.sigma }, peerEstimates, s.selfAbstained)
		return convergenceState(combinedEstimate.mu, combinedEstimate.sigma, all).converged
	})
	let hasVerdict = $derived(isConverged || conclusionMode != null)

	// Compute the snapped verdict value from the conclusion curve position
	let verdictValue = $derived.by(() => {
		if (conclusionMode == null) return null
		const snapped = snapVerdict(conclusionMode, s.unit)
		// Parse numeric value from snap string for handleNext
		const match = snapped.match(/([\d.]+)/)
		return match ? Number.parseFloat(match[1]) : null
	})

	// Reset conclusion when moving to a new ticket or re-estimating
	$effect(() => {
		void s.backlogIndex
		void s.revealed
		if (!s.revealed) { conclusionMode = null; conclusionSigma = null }
	})

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

	function handlePasteImport(tickets: ImportedTicket[]) {
		if (tickets.length === 0) return
		if (s.backlog.length > 0) {
			pendingImport = tickets
		} else {
			processBacklogImport(s, deps, tickets)
		}
		showPasteModal = false
	}

	function handleFileDrop(e: DragEvent) {
		e.preventDefault()
		dragOver = false
		if (!s.isCreator) return
		const file = e.dataTransfer?.files[0]
		if (file) handleBacklogImport(file)
	}
</script>

{#if !s.session}
	<SessionLobby onJoin={handleJoin} {queryRoomState} {queryPrepDone} />
	{#if connecting}
		<div class="connecting-overlay">
			<div class="connecting-spinner"></div>
			<span class="connecting-text">Looking for session…</span>
		</div>
	{/if}
{:else}
	<main
		style:padding-right="{s.backlog.length > 0 ? '276px' : '16px'}"
		ondragover={(e) => { if (s.isCreator) { e.preventDefault(); dragOver = true } }}
		ondragleave={() => (dragOver = false)}
		ondrop={handleFileDrop}
	>
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
				{#if s.isCreator && s.backlog.length === 0}
					<ImportMenu
						label="+ Add tickets ▾"
						onImportCsv={handleBacklogImport}
						onPasteList={() => (showPasteModal = true)}
						dropUp={false}
					/>
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
					{#if holdsMic}
						<button
							class="live-adjust-toggle"
							class:live-adjust-on={s.liveAdjust}
							title={s.liveAdjust ? 'Lock estimates' : 'Unlock for live adjustment'}
							onclick={() => toggleLiveAdjust(s)}
						>{s.liveAdjust ? '🔓' : '🔒'}</button>
					{/if}
					{#if hasVerdict && holdsMic}
						<button class="next" onclick={() => { const vo = verdictValue; conclusionMode = null; conclusionSigma = null; handleNext(s, deps, vo) }}>
							{s.backlog.length > 0 && s.backlogIndex < s.backlog.length - 1 ? 'Next issue →' : 'Next →'}
						</button>
					{/if}
					{#if holdsMic}
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

		{#if missedRounds > 0}
			<div class="missed-rounds">
				You missed {missedRounds} round{missedRounds > 1 ? 's' : ''} — see verdicts in the sidebar
				<button onclick={() => (missedRounds = 0)}>×</button>
			</div>
		{/if}

		{#if s.micDropMessage}
			<div class="mic-drop-toast">
				{s.micDropMessage}
				{#if s.isCreator}
					<button onclick={() => takeMicBack(s)}>Take 🎤</button>
				{:else}
					<button onclick={() => claimMic(s, selfId)}>Grab 🎤</button>
				{/if}
				<button class="dismiss" onclick={() => (s.micDropMessage = '')}>×</button>
			</div>
		{/if}

		<ParticipantsList
			participants={participantsData}
			{readyCount}
			{activeCount}
			isCreator={s.isCreator}
			{holdsMic}
			micHolder={s.micHolder}
			prepMode={s.prepMode}
			revealed={s.revealed}
			prepDone={s.prepDone}
			onTakeMicBack={() => takeMicBack(s)}
			onHandOffMic={(peerId) => handOffMic(s, selfId, peerId)}
			onSkipPeer={(peerId) => skipPeer(s, peerId)}
		/>

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
			hasMoved={s.hasMoved}
			hasEverDragged={s.hasEverDragged}
			liveAdjust={s.liveAdjust}
			isCreator={holdsMic}
			{conclusionMode}
			{conclusionSigma}
			onConclusionChange={(mode, sig) => { conclusionMode = mode; conclusionSigma = sig }}
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
					if (holdsMic || s.prepMode) selectTicket(s, index)
				}}
				onReorder={(from, to) => handleReorder(s, deps, from, to)}
				onRemove={(index) => handleRemove(s, deps, index)}
				onExportCsv={handleExportCsv}
				onExportExcel={handleExportExcel}
				onImportCsv={handleBacklogImport}
				onPasteList={() => (showPasteModal = true)}
			/>
		{/if}
	</main>
	{#if s.showSummary}
		<SessionSummaryDialog
			backlog={s.backlog}
			unit={s.unit}
			onExportCsv={handleExportCsv}
			onExportExcel={handleExportExcel}
			onClose={() => (s.showSummary = false)}
		/>
	{/if}
	{#if showOnboarding}
		<Onboarding userName={s.userName} prepMode={s.prepMode} onDismiss={dismissOnboarding} />
	{/if}
	{#if pendingImport}
		<ImportConfirmDialog
			existingCount={s.backlog.length}
			importCount={pendingImport.length}
			onMerge={handleImportMerge}
			onReplace={handleImportReplace}
			onCancel={() => (pendingImport = null)}
		/>
	{/if}
	{#if showPasteModal}
		<PasteListModal
			onImport={handlePasteImport}
			onCancel={() => { showPasteModal = false }}
		/>
	{/if}
	{#if dragOver}
		<div class="drop-overlay">
			<div class="drop-message">📋 Drop CSV file to import</div>
		</div>
	{/if}
{/if}

<style>
	:global(body) {
		margin: 0;
		font-family: var(--font);
		background: var(--c-bg);
		color: var(--c-text);
	}

	main {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: var(--sp-lg);
		box-sizing: border-box;
		gap: var(--sp-md);
		transition: padding-right var(--tr-normal);
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--sp-md);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}

	:global(:focus-visible) {
		outline: 2px solid var(--c-accent);
		outline-offset: 2px;
	}

	.header-center {
		display: flex;
		align-items: center;
		gap: var(--sp-sm);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--sp-sm);
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
		font-family: var(--font);
		font-size: var(--fs-3xl);
		font-weight: 700;
		color: var(--c-text);
		padding: var(--sp-xs) var(--sp-md) var(--sp-xs) var(--sp-xl);
	}

	.topic-input {
		background: transparent;
		border: 1px dashed transparent;
		border-radius: 2px;
		color: var(--c-text);
		font-family: var(--font);
		font-size: var(--fs-lg);
		font-weight: 600;
		padding: 2px 6px;
		flex: 1;
		min-width: 80px;
		outline: none;
	}

	.topic-input::placeholder {
		color: var(--c-text-faint);
		font-style: italic;
	}

	.topic-input:hover {
		border-color: var(--c-border);
	}

	.topic-input:focus {
		border-color: var(--c-accent);
		background: rgba(245, 240, 230, 0.6);
	}

	.connection-error {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: var(--c-red-bg);
		border: 1px dashed var(--c-red-border);
		border-radius: var(--radius-sm);
		color: var(--c-red);
		font-family: var(--font);
		font-size: var(--fs-lg);
		padding: var(--sp-sm) var(--sp-lg);
		margin: 0 var(--sp-lg);
	}

	.connection-error button {
		background: none;
		border: none;
		color: var(--c-red);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 var(--sp-xs);
	}

	.missed-rounds {
		display: flex;
		align-items: center;
		gap: 10px;
		background: rgba(59, 125, 216, 0.12);
		border: 1px dashed var(--c-accent-border);
		border-radius: var(--radius-sm);
		color: var(--c-accent-text);
		font-family: var(--font);
		font-size: var(--fs-md);
		padding: var(--sp-sm) var(--sp-lg);
		margin: 0 var(--sp-lg);
	}

	.missed-rounds button {
		background: none;
		border: none;
		color: var(--c-accent-text);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 var(--sp-xs);
	}

	.room-badge {
		font-family: var(--font);
		font-size: var(--fs-lg);
		background: rgba(210, 200, 180, 0.5);
		padding: 2px 10px;
		border-radius: var(--radius-sm);
		border: 1px dashed var(--c-border-soft);
		color: var(--c-text);
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: background var(--tr-fast);
	}

	.room-badge:hover {
		background: rgba(210, 200, 180, 0.7);
	}

	.copy-icon {
		opacity: 0.4;
		font-size: 0.9em;
		transition: opacity var(--tr-fast);
	}

	.room-badge:hover .copy-icon {
		opacity: 0.8;
	}

	.unit-select {
		font-family: var(--font);
		font-size: 0.95rem;
		background: rgba(210, 200, 180, 0.3);
		border: 1px dashed var(--c-border);
		border-radius: var(--radius-sm);
		padding: 1px var(--sp-xs);
		color: var(--c-text-soft);
		cursor: pointer;
	}

	.unit-badge {
		font-family: var(--font);
		font-size: 0.95rem;
		color: var(--c-text-muted);
	}

	button {
		padding: var(--sp-sm) var(--sp-xl);
		border: 1px dashed var(--c-accent-border);
		border-radius: var(--radius-sm);
		background: var(--c-accent-bg);
		color: var(--c-accent-text);
		font-family: var(--font);
		font-size: var(--fs-lg);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--tr-fast);
	}

	button:hover {
		background: var(--c-accent-bg-hover);
	}

	.leave {
		background: rgba(160, 150, 130, 0.25);
		border-color: var(--c-border-soft);
		color: var(--c-text-soft);
	}

	.leave:hover {
		background: rgba(160, 150, 130, 0.4);
	}

	.help-btn {
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-full);
		background: var(--c-neutral-bg-light);
		color: var(--c-text-ghost);
		font-family: var(--font);
		font-size: var(--fs-lg);
		font-weight: 700;
		cursor: pointer;
		line-height: 1;
		transition: background var(--tr-fast), color var(--tr-fast);
	}

	.help-btn:hover {
		background: var(--c-neutral-bg-hover);
		color: #5a5040;
	}

	.past-toggle {
		padding: var(--sp-xs) var(--sp-md);
		border: 1px dashed var(--c-border-soft);
		border-radius: var(--radius-sm);
		background: rgba(210, 200, 180, 0.15);
		color: var(--c-text-ghost);
		font-family: var(--font);
		font-size: 0.95rem;
		cursor: pointer;
		transition: background var(--tr-fast), color var(--tr-fast);
		white-space: nowrap;
	}

	.past-toggle:hover {
		background: var(--c-neutral-bg);
		color: var(--c-text-soft);
	}

	.past-toggle.past-active {
		background: rgba(210, 200, 180, 0.4);
		color: #5a5040;
		border-style: solid;
	}

	.mic-drop-toast {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--c-warm-bg);
		border: 1px dashed var(--c-warm-border);
		border-radius: var(--radius-sm);
		color: var(--c-warm);
		font-family: var(--font);
		font-size: var(--fs-md);
		padding: var(--sp-sm) var(--sp-lg);
		margin: 0 var(--sp-lg);
	}

	.mic-drop-toast button {
		padding: 3px 10px;
		font-size: 0.95rem;
	}

	.mic-drop-toast .dismiss {
		background: none;
		border: none;
		color: var(--c-warm);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 var(--sp-xs);
		margin-left: auto;
	}

	.next {
		background: var(--c-green-bg);
		border-color: var(--c-green-border);
		color: var(--c-green);
	}

	.next:hover {
		background: var(--c-green-bg-hover);
	}

	.done {
		background: var(--c-accent-bg);
		border-color: #8aaacc;
		color: var(--c-accent-text);
	}

	.done:hover {
		background: var(--c-accent-bg-hover);
	}

	.force-reveal {
		background: var(--c-warm-bg);
		border-color: var(--c-warm-border);
		color: var(--c-warm);
		font-size: 0.95rem;
	}

	.force-reveal:hover {
		background: rgba(180, 140, 60, 0.3);
	}

	.live-adjust-toggle {
		background: rgba(120, 120, 120, 0.1);
		border: 1.5px solid var(--c-border-soft);
		border-radius: var(--sp-sm);
		font-size: 1.2rem;
		padding: var(--sp-xs) 10px;
		cursor: pointer;
		transition: background var(--tr-fast);
		line-height: 1;
	}

	.live-adjust-toggle:hover {
		background: rgba(120, 120, 120, 0.2);
	}

	.live-adjust-toggle.live-adjust-on {
		background: rgba(80, 160, 80, 0.15);
		border-color: #8aba7a;
	}

	.mode-toggle {
		background: rgba(90, 140, 80, 0.15);
		border-color: var(--c-green-border);
		color: var(--c-green);
		font-size: 0.9rem;
		padding: 6px 14px;
	}

	.mode-toggle:hover {
		background: rgba(90, 140, 80, 0.3);
	}

	.topic-link {
		color: var(--c-accent-text);
		font-family: var(--font);
		font-size: var(--fs-lg);
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
		color: var(--c-accent);
	}

	.connecting-overlay {
		position: fixed;
		inset: 0;
		background: var(--c-overlay-light);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-lg);
		z-index: 30;
	}

	.connecting-spinner {
		width: 32px;
		height: 32px;
		border: 3px dashed var(--c-text-muted);
		border-radius: var(--radius-full);
		animation: spin 1.2s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.connecting-text {
		font-family: var(--font);
		font-size: var(--fs-xl);
		color: var(--c-text-soft);
	}

	.drop-overlay {
		position: fixed;
		inset: 0;
		background: rgba(59, 125, 216, 0.12);
		border: 3px dashed var(--c-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		pointer-events: none;
	}

	.drop-message {
		font-family: var(--font);
		font-size: var(--fs-3xl);
		color: var(--c-accent-text);
		background: rgba(245, 240, 230, 0.9);
		padding: var(--sp-lg) 32px;
		border-radius: var(--radius-md);
		border: 1px dashed #8aaacc;
	}
</style>
