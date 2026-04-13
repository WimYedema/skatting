<script lang="ts">
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import SessionLobby from './components/SessionLobby.svelte'
	import { lognormalMode, lognormalMean } from './lib/lognormal'
	import { createSession, getPeerColor, selfId, type PeerSession } from './lib/peer'
	import type { PeerEstimate } from './lib/types'

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

	let peerEstimates = $derived(
		Array.from(peerEstimateMap.values()).map((pe) => ({
			mu: pe.mu,
			sigma: pe.sigma,
			color: getPeerColor(pe.peerId, peerIds),
		})),
	)

	let peerCount = $derived(peerIds.length)

	/** All peer IDs including self, for ready tracking */
	let allParticipants = $derived([selfId, ...peerIds])

	let readyCount = $derived(
		allParticipants.filter((id) => id === selfId ? selfReady : readyPeers.has(id)).length,
	)

	let allReady = $derived(readyCount === allParticipants.length && allParticipants.length > 0)

	function handleEstimateChange(newMu: number, newSigma: number) {
		mu = newMu
		sigma = newSigma
		session?.sendEstimate({ mu: newMu, sigma: newSigma })

		if (!selfReady) {
			selfReady = true
			session?.sendReady({ ready: true })
		}
	}

	function handleReveal() {
		revealed = !revealed
		session?.sendReveal({ revealed })
	}

	function handleJoin(roomId: string, name: string, sessionTopic: string) {
		userName = name
		topic = sessionTopic

		session = createSession(roomId, {
			onPeerJoin(peerId) {
				peerIds = [...peerIds, peerId]
				// Send current state to the new peer
				session?.sendEstimate({ mu, sigma })
				session?.sendName({ name: userName })
				if (topic) {
					session?.sendTopic({ topic })
				}
				if (selfReady) {
					session?.sendReady({ ready: true })
				}
			},
			onPeerLeave(peerId) {
				peerIds = peerIds.filter((id) => id !== peerId)
				const nextEstimates = new Map(peerEstimateMap)
				nextEstimates.delete(peerId)
				peerEstimateMap = nextEstimates
				const nextNames = new Map(peerNames)
				nextNames.delete(peerId)
				peerNames = nextNames
				const nextReady = new Set(readyPeers)
				nextReady.delete(peerId)
				readyPeers = nextReady
			},
			onEstimate(estimate) {
				const next = new Map(peerEstimateMap)
				next.set(estimate.peerId, estimate)
				peerEstimateMap = next
			},
			onReveal(rev) {
				revealed = rev
			},
			onName(peerId, name) {
				const next = new Map(peerNames)
				next.set(peerId, name)
				peerNames = next
			},
			onTopic(newTopic) {
				if (newTopic) {
					topic = newTopic
				}
			},
			onReady(peerId, ready) {
				const next = new Set(readyPeers)
				if (ready) {
					next.add(peerId)
				} else {
					next.delete(peerId)
				}
				readyPeers = next
			},
		})
	}

	function handleLeave() {
		session?.leave()
		session = null
		peerIds = []
		peerEstimateMap = new Map()
		peerNames = new Map()
		readyPeers = new Set()
		selfReady = false
		revealed = false
		topic = ''
	}

	let mode = $derived(lognormalMode(mu, sigma).toFixed(1))
	let mean = $derived(lognormalMean(mu, sigma).toFixed(1))
</script>

{#if !session}
	<SessionLobby onJoin={handleJoin} />
{:else}
	<main>
		<header>
			<h1>Estimate</h1>
			<div class="stats">
				<span class="room-badge">{session.roomId}</span>
				{#if topic}
					<span class="topic">📋 {topic}</span>
				{/if}
				<span>Mode: {mode}</span>
				<span>Mean: {mean}</span>
				<span>σ: {sigma.toFixed(2)}</span>
			</div>
			<button class="leave" onclick={handleLeave}>Leave</button>
			<button onclick={handleReveal} class:ready-pulse={allReady && !revealed}>
				{revealed ? 'Hide' : 'Reveal'}
			</button>
		</header>

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
			onEstimateChange={handleEstimateChange}
		/>
	</main>
{/if}

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, -apple-system, sans-serif;
		background: #0f172a;
		color: #e2e8f0;
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
		font-size: 1.5rem;
	}

	.stats {
		display: flex;
		gap: 12px;
		font-size: 0.875rem;
		color: #94a3b8;
		font-variant-numeric: tabular-nums;
		flex: 1;
		min-width: 0;
	}

	.topic {
		color: #e2e8f0;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.room-badge {
		font-family: monospace;
		background: #1e293b;
		padding: 2px 8px;
		border-radius: 4px;
		color: #e2e8f0;
		letter-spacing: 0.1em;
	}

	.participants {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		background: #1e293b;
		border-radius: 6px;
		font-size: 0.8125rem;
		flex-wrap: wrap;
	}

	.participant {
		display: flex;
		align-items: center;
		gap: 5px;
		color: #94a3b8;
		transition: color 0.2s;
	}

	.participant.is-ready {
		color: #e2e8f0;
	}

	.ready-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #334155;
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
		color: #64748b;
		font-size: 0.75rem;
	}

	button {
		padding: 8px 20px;
		border: none;
		border-radius: 6px;
		background: #3b82f6;
		color: white;
		font-size: 0.875rem;
		cursor: pointer;
	}

	button:hover {
		background: #2563eb;
	}

	.leave {
		margin-left: auto;
		background: #334155;
	}

	.leave:hover {
		background: #475569;
	}

	.ready-pulse {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
		}
		50% {
			box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
		}
	}
</style>
