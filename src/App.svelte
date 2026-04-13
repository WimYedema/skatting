<script lang="ts">
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import SessionLobby from './components/SessionLobby.svelte'
	import { lognormalMode, lognormalMean } from './lib/lognormal'
	import { createSession, getPeerColor, type PeerSession } from './lib/peer'
	import type { PeerEstimate } from './lib/types'

	let mu = $state(2.0)
	let sigma = $state(0.6)
	let revealed = $state(false)
	let session = $state<PeerSession | null>(null)
	let peerIds = $state<string[]>([])
	let peerEstimateMap = $state<Map<string, PeerEstimate>>(new Map())

	let peerEstimates = $derived(
		Array.from(peerEstimateMap.values()).map((pe) => ({
			mu: pe.mu,
			sigma: pe.sigma,
			color: getPeerColor(pe.peerId, peerIds),
		})),
	)

	let peerCount = $derived(peerIds.length)

	function handleEstimateChange(newMu: number, newSigma: number) {
		mu = newMu
		sigma = newSigma
		session?.sendEstimate({ mu: newMu, sigma: newSigma })
	}

	function handleReveal() {
		revealed = !revealed
		session?.sendReveal({ revealed })
	}

	function handleJoin(roomId: string) {
		session = createSession(roomId, {
			onPeerJoin(peerId) {
				peerIds = [...peerIds, peerId]
				// Send current estimate to the new peer
				session?.sendEstimate({ mu, sigma })
			},
			onPeerLeave(peerId) {
				peerIds = peerIds.filter((id) => id !== peerId)
				const next = new Map(peerEstimateMap)
				next.delete(peerId)
				peerEstimateMap = next
			},
			onEstimate(estimate) {
				const next = new Map(peerEstimateMap)
				next.set(estimate.peerId, estimate)
				peerEstimateMap = next
			},
			onReveal(rev) {
				revealed = rev
			},
		})
	}

	function handleLeave() {
		session?.leave()
		session = null
		peerIds = []
		peerEstimateMap = new Map()
		revealed = false
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
				<span>{peerCount} peer{peerCount !== 1 ? 's' : ''}</span>
				<span>Mode: {mode}</span>
				<span>Mean: {mean}</span>
				<span>σ: {sigma.toFixed(2)}</span>
			</div>
			<button class="leave" onclick={handleLeave}>Leave</button>
			<button onclick={handleReveal}>
				{revealed ? 'Hide' : 'Reveal'}
			</button>
		</header>

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
	}

	.room-badge {
		font-family: monospace;
		background: #1e293b;
		padding: 2px 8px;
		border-radius: 4px;
		color: #e2e8f0;
		letter-spacing: 0.1em;
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
</style>
