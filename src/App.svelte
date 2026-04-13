<script lang="ts">
	import EstimationCanvas from './components/EstimationCanvas.svelte'
	import { lognormalMode, lognormalMean } from './lib/lognormal'

	let mu = $state(2.0)
	let sigma = $state(0.6)
	let revealed = $state(false)

	// Placeholder peer estimates for testing the overlay
	let peerEstimates: Array<{ mu: number; sigma: number; color: string }> = $state([])

	function handleEstimateChange(newMu: number, newSigma: number) {
		mu = newMu
		sigma = newSigma
	}

	let mode = $derived(lognormalMode(mu, sigma).toFixed(1))
	let mean = $derived(lognormalMean(mu, sigma).toFixed(1))
</script>

<main>
	<header>
		<h1>Estimate</h1>
		<div class="stats">
			<span>Mode: {mode}</span>
			<span>Mean: {mean}</span>
			<span>σ: {sigma.toFixed(2)}</span>
		</div>
		<button onclick={() => (revealed = !revealed)}>
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

	button {
		margin-left: auto;
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
</style>
