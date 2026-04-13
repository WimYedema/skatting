<script lang="ts">
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import SessionLobby from './components/SessionLobby.svelte'
	import { combineEstimates } from './lib/lognormal'
	import { createSession, getPeerColor, selfId, type PeerSession } from './lib/peer'
	import { saveSession } from './lib/session-store'
	import type { PeerEstimate } from './lib/types'

	interface HistoryEntry {
		label: string
		mu: number
		sigma: number
	}

	let mu = $state(2.0)
	let sigma = $state(0.6)
	let revealed = $state(false)
	let session = $state<PeerSession | null>(null)
	let peerIds = $state<string[]>([])
	let peerEstimateMap = $state<Map<string, PeerEstimate>>(new Map())

	let userName = $state('')
	let topic = $state('')
	let peerNames = $state<Map<string, string>>(new Map())
	let readyPeers = $state<Set<string>>(new Set())
	let selfReady = $state(false)
	let history = $state<HistoryEntry[]>([])
	let unit = $state('points')
	let isCreator = $state(false)
	let connectionError = $state('')

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
		session?.sendTopic({ topic: topic.trim() })
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

	function saveRoundToHistory() {
		const label = topic.trim() || `Item ${history.length + 1}`
		const allEstimates = [
			{ mu, sigma },
			...Array.from(peerEstimateMap.values()).map((pe) => ({
				mu: pe.mu,
				sigma: pe.sigma,
			})),
		]
		const combined = combineEstimates(allEstimates)
		if (combined && allEstimates.length > 1) {
			history = [...history, { label, mu: combined.mu, sigma: combined.sigma }]
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
		if (!revealed) return
		saveRoundToHistory()
		resetRound()
		session?.sendReveal({ revealed: false })
	}

	function handleJoin(roomId: string, name: string, selectedUnit: string | null) {
		userName = name
		isCreator = selectedUnit !== null
		if (selectedUnit) unit = selectedUnit
		connectionError = ''

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
				}
				if (topic) {
					session?.sendTopic({ topic })
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
			onTopic(newTopic) {
				if (newTopic) {
					topic = newTopic
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
				if (!isCreator) unit = peerUnit
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
	}
</script>

{#if !session}
	<SessionLobby onJoin={handleJoin} />
{:else}
	<main>
		<header>
			<h1>Estimate</h1>
			<div class="stats">
				<span class="room-badge">{session.roomId}</span>
				<input
					class="topic-input"
					type="text"
					bind:value={topic}
					placeholder="What are we estimating?"
					maxlength="100"
					onchange={handleTopicChange}
				/>
			</div>
			<button class="leave" onclick={handleLeave}>Leave</button>
			{#if revealed}
				<button class="next" onclick={handleNext}>Next →</button>
			{:else if !selfReady}
				<button class="done" onclick={handleDone}>Done ✓</button>
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
			{unit}
			onEstimateChange={handleEstimateChange}
		/>
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
</style>
