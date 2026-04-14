<script lang="ts">
	import {
		canvasToMathX,
		canvasYToSigmaFromPeak,
		drawScene,
		hitTestBlob,
		mathToCanvasX,
	} from '../lib/canvas'
	import { muFromMode } from '../lib/lognormal'

	interface Props {
		mu: number
		sigma: number
		peerEstimates: Array<{ mu: number; sigma: number; color: string; name: string }>
		revealed: boolean
		userName: string
		history: Array<{ label: string; mu: number; sigma: number }>
		unit: string
		currentTicket?: { id: string; title: string; labels?: string[]; assignee?: string; description?: string }
		onEstimateChange: (mu: number, sigma: number) => void
	}

	let { mu, sigma, peerEstimates, revealed, userName, history, unit, currentTicket, onEstimateChange }: Props = $props()

	let canvas: HTMLCanvasElement | undefined = $state()
	let container: HTMLDivElement | undefined = $state()
	let width = $state(800)
	let height = $state(500)
	let dragging = $state(false)

	let tooltipText = $state('')
	let tooltipX = $state(0)
	let tooltipY = $state(0)
	let showTooltip = $state(false)

	function handlePointerDown(e: PointerEvent) {
		dragging = true
		;(e.target as HTMLElement).setPointerCapture(e.pointerId)
		updateEstimate(e)
	}

	function handlePointerMove(e: PointerEvent) {
		if (dragging) {
			updateEstimate(e)
			showTooltip = false
			return
		}
		updateTooltip(e)
	}

	function handlePointerUp() {
		dragging = false
	}

	function updateTooltip(e: PointerEvent) {
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		const px = ((e.clientX - rect.left) / rect.width) * width
		const py = ((e.clientY - rect.top) / rect.height) * height

		// Check own blob first
		if (hitTestBlob(mu, sigma, px, py, width, height)) {
			tooltipText = userName ? `${userName} (you)` : 'Mine'
			tooltipX = e.clientX - rect.left
			tooltipY = e.clientY - rect.top
			showTooltip = true
			return
		}

		// Check peer blobs (only when revealed)
		if (revealed) {
			for (const peer of peerEstimates) {
				if (hitTestBlob(peer.mu, peer.sigma, px, py, width, height)) {
					tooltipText = peer.name
					tooltipX = e.clientX - rect.left
					tooltipY = e.clientY - rect.top
					showTooltip = true
					return
				}
			}
		}

		showTooltip = false
	}

	function handlePointerLeave() {
		showTooltip = false
	}

	function updateEstimate(e: PointerEvent) {
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		const canvasX = (e.clientX - rect.left) / rect.width * width
		const canvasY = (e.clientY - rect.top) / rect.height * height

		const desiredMode = Math.max(0.1, canvasToMathX(canvasX, width))
		const newSigma = canvasYToSigmaFromPeak(canvasY, height, desiredMode)
		const newMu = muFromMode(desiredMode, newSigma)
		onEstimateChange(newMu, newSigma)
	}

	// Observe the CONTAINER size, not the canvas — avoids feedback loops
	$effect(() => {
		if (!container) return
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (!entry) return
			const w = Math.round(entry.contentRect.width)
			const h = Math.round(entry.contentRect.height)
			if (w > 0 && h > 0) {
				width = w
				height = h
			}
		})
		observer.observe(container)
		return () => observer.disconnect()
	})

	$effect(() => {
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const currentMu = mu
		const currentSigma = sigma
		const currentPeers = peerEstimates
		const currentRevealed = revealed
		const currentHistory = history
		const w = width
		const h = height

		// Set buffer size and draw synchronously to avoid race conditions
		// between ResizeObserver and requestAnimationFrame
		if (canvas.width !== w) canvas.width = w
		if (canvas.height !== h) canvas.height = h

		drawScene(
			ctx,
			w,
			h,
			{ mu: currentMu, sigma: currentSigma },
			currentPeers,
			currentRevealed,
			currentHistory,
			unit,
			currentTicket,
		)
	})
</script>

<div class="canvas-container" bind:this={container}>
	<canvas
		bind:this={canvas}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointerleave={handlePointerLeave}
		style="cursor: {dragging ? 'grabbing' : 'crosshair'}; touch-action: none;"
	></canvas>
	{#if showTooltip}
		<div class="tooltip" style="left: {tooltipX}px; top: {tooltipY - 30}px;">
			{tooltipText}
		</div>
	{/if}
</div>

<style>
	.canvas-container {
		flex: 1;
		min-height: 300px;
		position: relative;
		overflow: hidden;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		background: #f5f0e6;
		border: 1px dashed #c0b89a;
		border-radius: 3px;
	}

	.tooltip {
		position: absolute;
		pointer-events: none;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		font-weight: 600;
		color: #3a3530;
		background: rgba(245, 240, 230, 0.9);
		border: 1px dashed #c0b89a;
		border-radius: 3px;
		padding: 2px 8px;
		white-space: nowrap;
		transform: translateX(-50%);
	}
</style>
