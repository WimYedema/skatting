<script lang="ts">
	import BacklogPanel from './components/BacklogPanel.svelte'
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import SessionLobby from './components/SessionLobby.svelte'
	import { parseCsv, exportToCsv, exportToXls, downloadFile } from './lib/csv'
	import { createSession, getPeerColor, selfId, type PeerSession } from './lib/peer'
	import { saveSession, getVerdictHistory, saveVerdict } from './lib/session-store'
	import type { EstimatedTicket, HistoryEntry, ImportedTicket, PeerEstimate } from './lib/types'
	import { applyVerdict, computeVerdict, upsertHistory } from './lib/verdict'

	let mu = $state(2.0)
	let sigma = $state(0.6)
	let revealed = $state(false)
	let session = $state<PeerSession | null>(null)
	let peerIds = $state<string[]>([])
	let peerEstimateMap = $state<Map<string, PeerEstimate>>(new Map())

	let userName = $state('')
	let topic = $state('')
	let topicUrl = $state('')
	let peerNames = $state<Map<string, string>>(new Map())
	let readyPeers = $state<Set<string>>(new Set())
	let selfReady = $state(false)
	let history = $state<HistoryEntry[]>([])
	let persistentHistory = $state<HistoryEntry[]>([])
	let showPersistentHistory = $state(true)
	let unit = $state('points')
	let isCreator = $state(false)
	let connectionError = $state('')

	// Backlog state
	let backlog = $state<EstimatedTicket[]>([])
	let backlogIndex = $state(-1)
	/** Personal estimates per ticket ID — preserved across ticket switches */
	let myEstimates = $state<Map<string, { mu: number; sigma: number }>>(new Map())

	let currentTicket = $derived<EstimatedTicket | undefined>(
		backlogIndex >= 0 && backlogIndex < backlog.length ? backlog[backlogIndex] : undefined,
	)

	let estimatedCount = $derived(backlog.filter((t) => t.median != null || myEstimates.has(t.id)).length)

	/** Prep mode: each person goes through backlog independently. Meeting mode: Ready/Reveal flow. */
	let prepMode = $state(false)

	let peerEstimates = $derived(
		Array.from(peerEstimateMap.values()).map((pe) => ({
			mu: pe.mu,
			sigma: pe.sigma,
			color: getPeerColor(pe.peerId, peerIds),
			name: peerNames.get(pe.peerId) ?? 'Peer',
		})),
	)

	let peerCount = $derived(peerIds.length)

	/** All peer IDs including self, for ready tracking */
	let allParticipants = $derived([selfId, ...peerIds])

	let readyCount = $derived(
		allParticipants.filter((id) => id === selfId ? selfReady : readyPeers.has(id)).length,
	)

	let allReady = $derived(readyCount === allParticipants.length && allParticipants.length > 0)

	// Auto-reveal when everyone has placed their estimate
	$effect(() => {
		if (allReady && !revealed) {
			revealed = true
			session?.sendReveal({ revealed: true })
		}
	})

	function handleEstimateChange(newMu: number, newSigma: number) {
		mu = newMu
		sigma = newSigma
		session?.sendEstimate({ mu: newMu, sigma: newSigma })
	}

	function handleDone() {
		if (selfReady) return
		selfReady = true
		session?.sendReady({ ready: true })
	}

	function handleTopicChange() {
		// Auto-detect URL typed as topic
		const trimmed = topic.trim()
		if (/^https?:\/\//.test(trimmed) && !topicUrl) {
			topicUrl = trimmed
		}
		session?.sendTopic({
			topic: trimmed,
			url: topicUrl || undefined,
			ticketId: currentTicket?.id,
		})
		persistSession()
	}

	function persistSession() {
		if (!session) return
		saveSession({
			roomId: session.roomId,
			userName,
			topic: topic.trim(),
			unit,
			isCreator,
			peerNames: Array.from(peerNames.values()),
			lastUsed: Date.now(),
		})
	}

	function handleForceReveal() {
		revealed = true
		session?.sendReveal({ revealed: true })
	}

	function addOrUpdateHistory(entry: HistoryEntry) {
		history = upsertHistory(history, entry)
		saveVerdict({ ...entry, unit, timestamp: Date.now() })
		persistentHistory = getVerdictHistory(unit)
	}

	function saveRoundToHistory() {
		const label = topic.trim() || `Item ${history.length + 1}`
		const peerEsts = Array.from(peerEstimateMap.values()).map((pe) => ({
			mu: pe.mu,
			sigma: pe.sigma,
		}))
		const verdict = computeVerdict(label, { mu, sigma }, peerEsts)

		if (currentTicket && verdict) {
			applyVerdict(currentTicket, verdict, unit)
			addOrUpdateHistory(verdict.historyEntry)
		} else if (verdict && peerEsts.length > 0) {
			addOrUpdateHistory(verdict.historyEntry)
		}
	}

	function resetRound() {
		revealed = false
		selfReady = false
		readyPeers = new Set()
		peerEstimateMap = new Map()
		topic = ''
		mu = 2.0
		sigma = 0.6
	}

	function handleNext() {
		if (!prepMode && !revealed) return
		// Save personal estimate for this ticket
		if (currentTicket) {
			myEstimates.set(currentTicket.id, { mu, sigma })
		}
		saveRoundToHistory()
		resetRound()
		if (!prepMode) {
			session?.sendReveal({ revealed: false })
		}

		// Auto-advance to next backlog ticket (skip save — already done above)
		if (backlog.length > 0 && backlogIndex < backlog.length - 1) {
			selectTicket(backlogIndex + 1, true)
		}
	}

	function selectTicket(index: number, skipSave = false) {
		if (index < 0 || index >= backlog.length) return

		// Save current personal estimate and verdict before switching
		if (!skipSave && currentTicket) {
			myEstimates.set(currentTicket.id, { mu, sigma })
			saveRoundToHistory()
		}

		// Reset round state for the new ticket
		revealed = false
		selfReady = false
		readyPeers = new Set()
		peerEstimateMap = new Map()

		backlogIndex = index
		const ticket = backlog[index]
		topic = ticket.title
		topicUrl = ticket.url ?? ''

		// Restore personal estimate if previously made
		const saved = myEstimates.get(ticket.id)
		if (saved) {
			mu = saved.mu
			sigma = saved.sigma
		} else {
			mu = 2.0
			sigma = 0.6
		}

		session?.sendTopic({
			topic: ticket.title,
			url: ticket.url,
			ticketId: ticket.id,
		})
	}

	function handleBacklogImport(file: File) {
		const reader = new FileReader()
		reader.onload = () => {
			const text = reader.result as string
			const tickets = parseCsv(text)
			if (tickets.length === 0) return
			backlog = tickets.map((t) => ({ ...t }))
			backlogIndex = -1
			prepMode = true
			session?.sendBacklog({ tickets })
			// Auto-select first ticket
			selectTicket(0)
		}
		reader.readAsText(file)
	}

	function handleExportCsv() {
		const csv = exportToCsv(backlog)
		const timestamp = new Date().toISOString().slice(0, 10)
		downloadFile(csv, `estimates-${timestamp}.csv`, 'text/csv')
	}

	function handleExportExcel() {
		const xls = exportToXls(backlog)
		const timestamp = new Date().toISOString().slice(0, 10)
		downloadFile(xls, `estimates-${timestamp}.xls`, 'application/vnd.ms-excel')
	}

	function handleJoin(roomId: string, name: string, selectedUnit: string | null) {
		userName = name
		isCreator = selectedUnit !== null
		if (selectedUnit) unit = selectedUnit
		connectionError = ''

		// Load persistent history for the current unit
		persistentHistory = getVerdictHistory(unit)

		saveSession({
			roomId,
			userName: name,
			topic: '',
			unit: selectedUnit ?? unit,
			isCreator,
			peerNames: [],
			lastUsed: Date.now(),
		})

		session = createSession(roomId, {
			onPeerJoin(peerId) {
				peerIds = [...peerIds, peerId]
				// Send current state to the new peer
				session?.sendEstimate({ mu, sigma })
				session?.sendName({ name: userName })
				if (isCreator) {
					session?.sendUnit({ unit })
					if (backlog.length > 0) {
						session?.sendBacklog({ tickets: backlog })
					}
				}
				if (topic) {
					session?.sendTopic({
						topic,
						url: topicUrl || undefined,
						ticketId: currentTicket?.id,
					})
				}
				if (selfReady) {
					session?.sendReady({ ready: true })
				}
			},
			onPeerLeave(peerId) {
				peerIds = peerIds.filter((id) => id !== peerId)
				peerEstimateMap.delete(peerId)
				peerNames.delete(peerId)
				readyPeers.delete(peerId)
			},
			onEstimate(estimate) {
				peerEstimateMap.set(estimate.peerId, estimate)
			},
			onReveal(rev) {
				revealed = rev
				// When reveal is turned off (Next was pressed by someone),
				// save history and reset local state for a new round
				if (!rev) {
					saveRoundToHistory()
					resetRound()
				}
			},
			onName(peerId, name) {
				peerNames.set(peerId, name)
				persistSession()
			},
			onTopic(newTopic, url, ticketId) {
				if (newTopic) {
					topic = newTopic
					topicUrl = url ?? ''
					// If we have a backlog and received a ticketId, sync the index
					if (ticketId && backlog.length > 0) {
						const idx = backlog.findIndex((t) => t.id === ticketId)
						if (idx >= 0) backlogIndex = idx
					}
				}
			},
			onReady(peerId, ready) {
				if (ready) {
					readyPeers.add(peerId)
				} else {
					readyPeers.delete(peerId)
				}
			},
			onUnit(peerUnit) {
				if (!isCreator) {
					unit = peerUnit
					persistentHistory = getVerdictHistory(unit)
				}
			},
			onBacklog(tickets) {
				if (!isCreator && tickets.length > 0) {
					backlog = tickets.map((t) => ({ ...t }))
					backlogIndex = -1
					prepMode = true
				}
			},
			onConnectionError(message) {
				connectionError = message
			},
		})
	}

	function handleLeave() {
		session?.leave()
		session = null
		peerIds = []
		peerNames = new Map()
		resetRound()
		history = []
		unit = 'points'
		isCreator = false
		connectionError = ''
		backlog = []
		backlogIndex = -1
		topicUrl = ''
		myEstimates = new Map()
		prepMode = false
	}
</script>

{#if !session}
	<SessionLobby onJoin={handleJoin} />
{:else}
	<main style:padding-right="{backlog.length > 0 ? '276px' : '16px'}">
		<header>
			<h1>Estimate</h1>
			<div class="stats">
				<span class="room-badge">{session.roomId}</span>
				{#if topicUrl}
					<a
						class="topic-link"
						href={topicUrl}
						target="_blank"
						rel="noopener noreferrer"
						title={topicUrl}
					>
						{topic || topicUrl}
					</a>
				{:else}
					<input
						class="topic-input"
						type="text"
						bind:value={topic}
						placeholder="What are we estimating?"
						maxlength="100"
						onchange={handleTopicChange}
					/>
				{/if}
				{#if backlog.length > 0}
					<span class="backlog-progress">{estimatedCount}/{backlog.length}</span>
				{/if}
			</div>
			{#if isCreator && backlog.length > 0 && estimatedCount > 0}
				<button class="export" onclick={handleExportCsv}>CSV ↓</button>
				<button class="export" onclick={handleExportExcel}>Excel ↓</button>
			{/if}
			<label class="history-toggle">
				<input type="checkbox" bind:checked={showPersistentHistory} />
				Past
			</label>
			<button class="leave" onclick={handleLeave}>Leave</button>
			{#if prepMode}
				<button class="next" onclick={handleNext}>
					{backlogIndex < backlog.length - 1 ? 'Next issue →' : 'Finish ✓'}
				</button>
				<button class="mode-toggle" onclick={() => (prepMode = false)}>Start meeting</button>
			{:else if revealed}
				<button class="next" onclick={handleNext}>
					{backlog.length > 0 && backlogIndex < backlog.length - 1 ? 'Next issue →' : 'Next →'}
				</button>
			{:else if !selfReady}
				<button class="done" onclick={handleDone}>Ready ✓</button>
			{:else if !allReady}
				<button class="force-reveal" onclick={handleForceReveal}>Reveal anyway</button>
			{/if}
		</header>

		{#if connectionError}
			<div class="connection-error">
				{connectionError}
				<button onclick={() => (connectionError = '')}>×</button>
			</div>
		{/if}

		<div class="participants">
			<div class="participant" class:is-ready={selfReady}>
				<span class="ready-dot" class:ready={selfReady}></span>
				<span class="name">{userName} (you)</span>
			</div>
			{#each peerIds as peerId}
				<div class="participant" class:is-ready={readyPeers.has(peerId)}>
					<span
						class="ready-dot"
						class:ready={readyPeers.has(peerId)}
						style="--peer-color: {getPeerColor(peerId, peerIds)}"
					></span>
					<span class="name">{peerNames.get(peerId) ?? 'Connecting…'}</span>
				</div>
			{/each}
			<span class="ready-count">{readyCount}/{allParticipants.length} ready</span>
		</div>

		<EstimationCanvas
			{mu}
			{sigma}
			{peerEstimates}
			{revealed}
			{userName}
			{history}
			persistentHistory={showPersistentHistory ? persistentHistory : []}
			{unit}
			{currentTicket}
			onEstimateChange={handleEstimateChange}
		/>

		{#if backlog.length > 0}
			<BacklogPanel
				tickets={backlog}
				currentIndex={backlogIndex}
				{isCreator}
				{myEstimates}
				onSelect={(index) => {
					if (isCreator) selectTicket(index)
				}}
			/>
		{:else if isCreator}
			<div class="import-prompt">
				<label class="import-label">
					<input
						type="file"
						accept=".csv"
						class="file-input"
						onchange={(e) => {
							const file = (e.target as HTMLInputElement).files?.[0]
							if (file) handleBacklogImport(file)
						}}
					/>
					📋 Import backlog (CSV)
				</label>
			</div>
		{/if}
	</main>
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
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-size: 1.8rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.stats {
		display: flex;
		gap: 12px;
		font-size: 1.05rem;
		color: #6a6050;
		font-variant-numeric: tabular-nums;
		flex: 1;
		min-width: 0;
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
		margin-left: auto;
		background: rgba(160, 150, 130, 0.25);
		border-color: #b0a890;
		color: #6a6050;
	}

	.leave:hover {
		background: rgba(160, 150, 130, 0.4);
	}

	.history-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8em;
		color: #7a7060;
		cursor: pointer;
		user-select: none;
	}

	.history-toggle input {
		cursor: pointer;
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

	.import-prompt {
		display: flex;
		justify-content: center;
		padding: 8px;
	}

	.import-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 20px;
		border: 1px dashed #b0a890;
		border-radius: 3px;
		background: rgba(210, 200, 180, 0.25);
		color: #6a6050;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.import-label:hover {
		background: rgba(210, 200, 180, 0.45);
	}

	.file-input {
		display: none;
	}
</style>
