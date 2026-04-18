<script lang="ts">
	import BacklogPanel from './components/BacklogPanel.svelte'
	import DebugPanel from './components/DebugPanel.svelte'
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import ImportConfirmDialog from './components/ImportConfirmDialog.svelte'
	import ImportMenu from './components/ImportMenu.svelte'
	import Onboarding from './components/Onboarding.svelte'
	import ParticipantsList from './components/ParticipantsList.svelte'
	import PasteListModal from './components/PasteListModal.svelte'
	import SessionLobby from './components/SessionLobby.svelte'
	import SessionSummaryDialog from './components/SessionSummaryDialog.svelte'
	import { parseCsv, exportToCsv, exportToXls, downloadFile } from './lib/csv'
	import { DEBUG, debugLog, onDebugToggle } from './lib/debug'
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
	import { saveSession, createScopedStorage, setStorageQuotaHandler } from './lib/session-store'
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
		claimCreator,
		buildParticipantsData,
		MIC_HOLDER_STALE_MS,
		type SessionDeps,
	} from './lib/session-controller'

	let s = $state(createInitialState())

	// Debug mode — reactive so UI updates when toggled via Ctrl+Shift+D
	let debugActive = $state(DEBUG)
	onDebugToggle((active) => {
		debugActive = active
		if (active) {
			;(window as unknown as Record<string, unknown>).__estimate = {
				get state() { return s },
				get session() { return s.session },
				get peerIds() { return s.peerIds },
				get peerNames() { return s.peerNames },
			}
		}
	})

	// Expose internals in debug mode for console diagnostics
	if (DEBUG) {
		;(window as unknown as Record<string, unknown>).__estimate = {
			get state() { return s },
			get session() { return s.session },
			get peerIds() { return s.peerIds },
			get peerNames() { return s.peerNames },
		}
	}

	const ONBOARDING_KEY = 'estimate-onboarded'
	let showOnboarding = $state(false)
	let pendingImport = $state<ImportedTicket[] | null>(null)
	let connecting = $state(false)
	let storageWarning = $state(false)
	let missedRounds = $state(0)
	let nameConflict = $state('')
	let showPasteModal = $state(false)
	let showOverflow = $state(false)
	let dragOver = $state(false)
	let backlogCollapsed = $state(window.innerWidth < 768)

	// --- Demo mode ----------------------------------------------------------
	const DEMO_PEER_IDS = ['demo-alice', 'demo-bob', 'demo-carol'] as const
	const DEMO_NAMES = new Map([
		['demo-alice', 'Alice'],
		['demo-bob', 'Bob'],
		['demo-carol', 'Carol'],
	])
	const DEMO_ESTIMATES: Record<string, { mu: number; sigma: number }> = {
		'demo-alice': { mu: 2.5, sigma: 0.35 },
		'demo-bob':   { mu: 1.9, sigma: 0.80 },
		'demo-carol': { mu: 3.1, sigma: 0.45 },
	}
	const DEMO_ROOM_ID = 'demo'

	let demoMode = $state(new URLSearchParams(window.location.search).has('demo'))
	let demoResetIn = $state<number | null>(null)
	let displayRoomId = $derived(s.session?.roomId ?? (demoMode ? DEMO_ROOM_ID : ''))

	function exitDemo() {
		demoMode = false
		s = createInitialState()
		const url = new URL(window.location.href)
		url.searchParams.delete('demo')
		window.history.replaceState({}, '', url.toString())
	}

	$effect(() => {
		if (!demoMode) return

		s.userName = 'You'
		s.mu = 2.2
		s.sigma = 0.50
		s.hasMoved = true
		s.topic = 'User auth redesign'
		s.peerIds = [...DEMO_PEER_IDS]
		s.peerNames = new Map(DEMO_NAMES)
		s.isCreator = false
		s.creatorPeerId = 'demo-alice'
		s.prepMode = false

		const COUNTDOWN_SECS = 13 // after all peers ready → total ~20 s (3+2+2+13)
		let cancelled = false
		const timers: ReturnType<typeof setTimeout>[] = []
		let countdownInterval: ReturnType<typeof setInterval> | null = null

		function schedule(fn: () => void, ms: number) {
			const t = setTimeout(() => { if (!cancelled) fn() }, ms)
			timers.push(t)
		}

		function stopCountdown() {
			if (countdownInterval !== null) { clearInterval(countdownInterval); countdownInterval = null }
			demoResetIn = null
		}

		function startCountdown(secs: number) {
			stopCountdown()
			demoResetIn = secs
			countdownInterval = setInterval(() => {
				if (cancelled) { stopCountdown(); return }
				demoResetIn = demoResetIn !== null && demoResetIn > 1 ? demoResetIn - 1 : null
				if (demoResetIn === null) stopCountdown()
			}, 1000)
		}

		function resetDemoRound() {
			stopCountdown()
			s.readyPeers = new Set()
			s.selfReady = false
			s.revealed = false
			s.peerEstimateMap = new Map()
			s.conclusionMode = null
			s.conclusionSigma = null
		}

		function runLoop() {
			timers.forEach(clearTimeout)
			timers.length = 0
			resetDemoRound()
			schedule(() => {
				s.readyPeers = new Set(['demo-alice'])
				schedule(() => {
					s.readyPeers = new Set(['demo-alice', 'demo-bob'])
					schedule(() => {
						s.peerEstimateMap = new Map(
							DEMO_PEER_IDS.map((id) => [id, { peerId: id, ...DEMO_ESTIMATES[id] }]),
						)
						s.readyPeers = new Set([...DEMO_PEER_IDS])
						// User clicks "Ready ✓" themselves — checkAutoReveal fires when allReady
						startCountdown(COUNTDOWN_SECS)
						schedule(runLoop, COUNTDOWN_SECS * 1000)
					}, 2000)
				}, 2000)
			}, 3000)
		}

		runLoop()

		return () => {
			cancelled = true
			timers.forEach(clearTimeout)
			stopCountdown()
		}
	})

	// Animate Alice dragging the conclusion curve after demo reveal
	$effect(() => {
		if (!demoMode || !s.revealed) return

		// Animate mode from ~8 → 12 (snaps to 13 pts) over ~2s, 2s after reveal
		const STEPS = [8.0, 9.2, 10.5, 11.4, 12.0]
		const SIGMA = 0.25
		let stepIndex = 0
		let intervalId: ReturnType<typeof setInterval> | null = null

		const startId = setTimeout(() => {
			intervalId = setInterval(() => {
				if (stepIndex < STEPS.length) {
					s.conclusionMode = STEPS[stepIndex]
					s.conclusionSigma = SIGMA
					stepIndex++
				} else {
					clearInterval(intervalId!)
					intervalId = null
				}
			}, 300)
		}, 2000)

		return () => {
			clearTimeout(startId)
			if (intervalId !== null) clearInterval(intervalId)
		}
	})
	// --- End demo mode ------------------------------------------------------

	// Tick counter for stale-peer detection (updates every 5s to re-evaluate)
	const STALE_THRESHOLD = 15_000
	let staleTick = $state(0)
	$effect(() => {
		const t = setInterval(() => { staleTick++ }, 5000)
		return () => clearInterval(t)
	})

	function dismissOnboarding() {
		showOnboarding = false
		localStorage.setItem(ONBOARDING_KEY, '1')
	}

	// Wire up storage quota warning
	setStorageQuotaHandler(() => { storageWarning = true })

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
		onConclusion(mode, sigma, ts) {
			if (ts <= lastConclusionTs) return
			lastConclusionTs = ts
			s.conclusionMode = mode
			s.conclusionSigma = sigma
		},
		onNameConflict(conflictingName) {
			nameConflict = conflictingName
			leaveSession(s)
		},
	}

	async function handleJoin(roomId: string, name: string, selectedUnit: string | null) {
		debugLog('app', 'handleJoin', { roomId, name, selectedUnit })
		nameConflict = ''
		connecting = true
		prepareJoin(s, deps, roomId, name, selectedUnit)
		try {
			debugLog('app', 'querying Nostr state…')
			const [roomState, prepDone] = await Promise.all([
				queryRoomState(roomId),
				queryPrepDone(roomId),
			])
			debugLog('app', 'Nostr state received', { hasRoomState: !!roomState, prepDoneCount: prepDone.length })
			applyNostrState(s, roomState, prepDone)
		} catch {
			debugLog('app', 'Nostr query failed (non-fatal)')
		}
		debugLog('app', 'connecting P2P…')
		connectSession(s, deps, roomId)
		debugLog('app', 'session created', { sessionExists: !!s.session })
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
	let noCreator = $derived(!s.isCreator && s.creatorPeerId === null)

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

	// True when we have peers but haven't received a name from any of them yet.
	// This means our outbound messages may be failing — block shared actions.
	let peerSyncPending = $derived(
		s.peerIds.length > 0 && s.peerIds.every((id) => !s.peerNames.has(id)),
	)

	// Stale mic holder warning: mic holder is remote + stale + everyone ready → auto-reveal blocked
	let micHolderStale = $derived.by(() => {
		void staleTick
		if (!s.micHolder || s.revealed || s.prepMode || !allReady) return false
		const lastSeen = s.peerLastSeen.get(s.micHolder)
		return lastSeen != null && Date.now() - lastSeen > MIC_HOLDER_STALE_MS
	})

	let participantsData = $derived.by(() => {
		void staleTick
		return buildParticipantsData(s, selfId, holdsMic, STALE_THRESHOLD, Date.now())
	})

	// Throttled conclusion send: at most one send per 50ms, always sending the latest value
	let conclusionSendTimer: ReturnType<typeof setTimeout> | null = null
	let pendingConclusion: { mode: number | null; sigma: number | null } | null = null
	function sendConclusionThrottled(mode: number | null, sigma: number | null) {
		pendingConclusion = { mode, sigma }
		if (conclusionSendTimer) return
		const send = () => {
			if (pendingConclusion) {
				s.session?.sendConclusion({ ...pendingConclusion, ts: Date.now() })
				pendingConclusion = null
			}
			conclusionSendTimer = null
		}
		send()
		conclusionSendTimer = setTimeout(send, 50)
	}

	// Timestamp-based ordering: discard stale conclusion messages from peers
	let lastConclusionTs = 0
	let combinedEstimate = $derived.by(() => {
		if (!s.revealed) return null
		return combineEstimates(collectEstimates({ mu: s.mu, sigma: s.sigma }, peerEstimates, s.selfAbstained))
	})
	let isConverged = $derived.by(() => {
		if (!combinedEstimate) return true
		const all = collectEstimates({ mu: s.mu, sigma: s.sigma }, peerEstimates, s.selfAbstained)
		return convergenceState(combinedEstimate.mu, combinedEstimate.sigma, all).converged
	})
	let hasVerdict = $derived(isConverged || s.conclusionMode != null)

	// Compute the snapped verdict value from the conclusion curve position
	let verdictValue = $derived.by(() => {
		if (s.conclusionMode == null) return null
		const snapped = snapVerdict(s.conclusionMode, s.unit)
		// Parse numeric value from snap string for handleNext
		const match = snapped.match(/([\d.]+)/)
		return match ? Number.parseFloat(match[1]) : null
	})

	// Reset lastConclusionTs when moving to a new round (resetRound clears conclusionMode/Sigma)
	$effect(() => {
		void s.backlogIndex
		void s.revealed
		if (!s.revealed) { lastConclusionTs = 0 }
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

{#if !s.session && !demoMode}
	<SessionLobby onJoin={handleJoin} {queryRoomState} {queryPrepDone} {nameConflict} onDemo={() => { demoMode = true; const url = new URL(window.location.href); url.searchParams.set('demo', ''); window.history.replaceState({}, '', url.toString()) }} />
	{#if connecting}
		<div class="connecting-overlay">
			<div class="connecting-spinner"></div>
			<span class="connecting-text">Looking for session…</span>
		</div>
	{/if}
{:else}
	<main
		class:has-backlog={s.backlog.length > 0}
		class:backlog-expanded={s.backlog.length > 0 && !backlogCollapsed}
		ondragover={(e) => { if (s.isCreator) { e.preventDefault(); dragOver = true } }}
		ondragleave={() => (dragOver = false)}
		ondrop={handleFileDrop}
	>
		<header>
			<div class="header-left">
				<h1 class="logo">
				<svg class="logo-icon" viewBox="0 0 28 24" aria-hidden="true">
					<!-- Wobbly axis lines -->
					<path d="M2.2,22.3 L8,21.8 L15,22.2 L22,21.9 L26.1,22.1" fill="none" stroke="#5a5040" stroke-width="0.8"/>
					<path d="M2.3,22.3 L1.8,14 L2.2,8 L1.9,2.2" fill="none" stroke="#5a5040" stroke-width="0.8"/>
					<!-- Lognormal curve — wobbly, with subtle fill underneath -->
					<path d="M3.2,21.5 C5.1,21.2 7.2,18.8 9.1,13.8 C11.2,7.9 12.1,4.2 14.2,3.1 C16.1,4.3 18.3,10.2 20.8,15.8 C23.1,19.4 25.2,21.1 26.8,21.3 L26.1,22.1 L2.2,22.3 Z"
						fill="rgba(91,123,154,0.1)" stroke="none"/>
					<path d="M3.2,21.5 C5.1,21.2 7.2,18.8 9.1,13.8 C11.2,7.9 12.1,4.2 14.2,3.1 C16.1,4.3 18.3,10.2 20.8,15.8 C23.1,19.4 25.2,21.1 26.8,21.3"
						fill="none" stroke="#5b7b9a" stroke-width="1.8" stroke-linecap="round"/>
				</svg>
				<span class="logo-text">Skatting</span>
			</h1>
				<span class="room-badge" role="button" tabindex="0" title="Copy room code" data-tour="room" onclick={() => navigator.clipboard.writeText(displayRoomId)}>{displayRoomId} <span class="copy-icon">⎘</span></span>
				{#if s.isCreator && estimatedCount === 0 && s.history.length === 0}
					{#if s.unit === 'points' || s.unit === 'days'}
						<select class="unit-select" value={s.unit} onchange={(e) => changeUnit(s, (e.target as HTMLSelectElement).value)}>
							<option value="points">points</option>
							<option value="days">days</option>
						</select>
					{:else}
						<span class="unit-badge">{s.unit}</span>
					{/if}
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
			<div class="header-right">
				{#if s.isCreator && s.backlog.length === 0}
					<ImportMenu
						label="+ Add tickets ▾"
						onImportCsv={handleBacklogImport}
						onPasteList={() => (showPasteModal = true)}
						dropUp={false}
					/>
				{/if}
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
							onclick={() => { toggleLiveAdjust(s); if (s.liveAdjust) { s.conclusionMode = null; s.conclusionSigma = null; sendConclusionThrottled(null, null) } }}
						>{s.liveAdjust ? '🔓' : '🔒'}</button>
					{/if}
					{#if hasVerdict && holdsMic}
						<button class="next" onclick={() => { handleNext(s, deps, verdictValue) }}>
							{s.backlog.length > 0 && s.backlogIndex < s.backlog.length - 1 ? 'Next issue →' : 'Next →'}
						</button>
					{/if}
					{#if holdsMic}
						<button class="mode-toggle" onclick={() => reEstimate(s)}>Re-estimate ↺</button>
					{/if}
				{:else if !s.selfReady}
					<button class="done" data-tour="ready" disabled={peerSyncPending} title={peerSyncPending ? 'Waiting for peers to sync…' : ''} onclick={() => handleDone(s)}>Ready ✓</button>
				{:else if !allReady}
					<button class="force-reveal" disabled={peerSyncPending} onclick={() => handleForceReveal(s)}>Reveal anyway</button>
				{/if}
				<div class="overflow-menu">
					<button class="overflow-btn" onclick={() => (showOverflow = !showOverflow)} title="More options">⋮</button>
					{#if showOverflow}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="overflow-backdrop" onclick={() => (showOverflow = false)}></div>
						<div class="overflow-dropdown">
							<button onclick={() => { s.showPersistentHistory = !s.showPersistentHistory; showOverflow = false }}>
								{s.showPersistentHistory ? '↩ Hide past' : '↪ Show past'}
							</button>
							{#if !s.prepMode && s.isCreator && s.backlog.length > 0}
								<button onclick={() => { returnToPrep(s); showOverflow = false }}>Back to prep</button>
							{/if}
							<button onclick={() => { showOnboarding = true; showOverflow = false }}>Help ?</button>
							<button class="overflow-leave" onclick={() => { showOverflow = false; if (demoMode) { exitDemo() } else { leaveSession(s); const url = new URL(window.location.href); url.searchParams.delete('room'); window.history.replaceState({}, '', url.toString()) } }}>Leave</button>
						</div>
					{/if}
				</div>
			</div>
		</header>

		{#if demoMode}
			<div class="demo-banner">
				Demo — drag the blob to try it out!
				{#if demoResetIn !== null}<span class="demo-timer">Resets in {demoResetIn}s</span>{/if}
				<a href="." onclick={(e) => { e.preventDefault(); exitDemo() }}>Start a real session →</a>
			</div>
		{/if}

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

		{#if micHolderStale}
			<div class="connection-error">
				Facilitator unresponsive — auto-reveal paused
				<button onclick={() => { claimMic(s, selfId); handleForceReveal(s) }}>Grab 🎤 &amp; Reveal</button>
			</div>
		{/if}

		{#if storageWarning}
			<div class="missed-rounds">
				Storage full — history may not be saved. Clear old sessions in the lobby.
				<button onclick={() => (storageWarning = false)}>×</button>
			</div>
		{/if}

		{#if noCreator}
			<div class="missed-rounds">
				No one owns the backlog
				<button onclick={() => claimCreator(s, deps)}>Claim backlog ✎</button>
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
			conclusionMode={s.conclusionMode}
			conclusionSigma={s.conclusionSigma}
			onConclusionChange={(mode, sig) => { s.conclusionMode = mode; s.conclusionSigma = sig; sendConclusionThrottled(mode, sig) }}
			showAbstainButton={!s.selfReady && !s.revealed && !peerSyncPending}
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
				unit={s.unit}
				bind:collapsed={backlogCollapsed}
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
			myEstimates={s.myEstimates}
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

{#if debugActive}
	<DebugPanel
		roomId={s.session?.roomId ?? ''}
		peerCount={s.peerIds.length}
		sessionActive={!!s.session}
	/>
{/if}

<div class="footer-links">
	<a class="footer-link" href="https://github.com/WimYedema/skatting" target="_blank" rel="noopener" title="View on GitHub">GitHub</a>
	<span class="footer-sep">·</span>
	<a class="footer-link hash" href="https://github.com/WimYedema/skatting/commit/{__BUILD_HASH__}" target="_blank" rel="noopener" title="Build {__BUILD_HASH__}">{__BUILD_HASH__}</a>
</div>

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
		height: 100dvh;
		padding: var(--sp-lg);
		box-sizing: border-box;
		gap: var(--sp-md);
		transition: padding-right var(--tr-normal), padding-bottom var(--tr-normal);
	}

	main.has-backlog {
		padding-right: 56px;
	}

	main.backlog-expanded {
		padding-right: 276px;
	}

	@media (max-width: 768px) {
		main.has-backlog {
			padding-right: var(--sp-lg);
			padding-bottom: 56px;
		}

		main.backlog-expanded {
			padding-right: var(--sp-lg);
			padding-bottom: 50vh;
		}
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--sp-md);
		flex-wrap: wrap;
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

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--sp-sm);
		flex-shrink: 0;
	}

	.overflow-menu {
		position: relative;
	}

	.overflow-btn {
		background: none;
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		color: var(--c-text);
		font-size: var(--fs-xl);
		cursor: pointer;
		padding: 2px 8px;
		line-height: 1;
	}

	.overflow-btn:hover {
		background: var(--c-neutral-bg-hover);
	}

	.overflow-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.overflow-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--sp-xs);
		background: var(--c-surface);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		z-index: 100;
		min-width: 160px;
		display: flex;
		flex-direction: column;
		padding: var(--sp-xs) 0;
	}

	.overflow-dropdown button {
		background: none;
		border: none;
		color: var(--c-text);
		font-family: var(--font);
		font-size: var(--fs-md);
		padding: var(--sp-sm) var(--sp-md);
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
	}

	.overflow-dropdown button:hover {
		background: var(--c-neutral-bg-hover);
	}

	.overflow-leave {
		color: var(--c-danger) !important;
	}

	@media (max-width: 640px) {
		.logo-text {
			display: none;
		}

		header {
			gap: var(--sp-sm);
		}

		.header-left {
			gap: 6px;
			flex-wrap: wrap;
		}

		.header-right {
			gap: var(--sp-xs);
		}

		.header-right button {
			padding: var(--sp-xs) var(--sp-sm);
			font-size: var(--fs-sm);
		}

		.topic-input {
			flex-basis: 100%;
			order: 10;
		}

		.topic-link {
			flex-basis: 100%;
			order: 10;
			max-width: 100%;
		}
	}

	h1, .logo {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-xs);
		white-space: nowrap;
		line-height: 1;
	}

	.logo-icon {
		width: 28px;
		height: 24px;
		flex-shrink: 0;
	}

	.logo-text {
		font-family: var(--font);
		font-size: var(--fs-3xl);
		font-weight: 700;
		color: var(--c-text);
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
		overflow: hidden;
		text-overflow: ellipsis;
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

	.demo-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-sm);
		background: var(--c-accent-bg);
		border: 1px dashed var(--c-accent-border);
		border-radius: var(--radius-sm);
		color: var(--c-accent-text);
		font-size: var(--fs-sm);
		padding: var(--sp-xs) var(--sp-md);
	}

	.demo-banner a {
		font-weight: 600;
		color: var(--c-accent-text);
	}

	.demo-timer {
		background: var(--c-accent-bg-hover);
		border-radius: var(--radius-lg);
		padding: 1px var(--sp-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
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

	.footer-links {
		position: fixed;
		bottom: var(--sp-sm);
		right: var(--sp-sm);
		display: flex;
		align-items: center;
		gap: var(--sp-xs);
		font-family: var(--font);
		font-size: var(--fs-xs);
		opacity: 0.4;
		z-index: 1;
		transition: opacity var(--tr-fast);
	}

	.footer-links:hover {
		opacity: 1;
	}

	.footer-link {
		color: var(--c-text-muted);
		text-decoration: none;
	}

	.footer-link:hover {
		text-decoration: underline;
	}

	.footer-link.hash {
		font-family: var(--font-mono, monospace);
	}

	.footer-sep {
		color: var(--c-text-muted);
	}
</style>
