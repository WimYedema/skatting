<script lang="ts">
	import {
		canvasToMathX,
		canvasYToSigmaFromPeak,
		drawScene,
		hitTestBlob,
		mathToCanvasX,
	} from '../lib/canvas'
	import { combineEstimates, lognormalQuantile, muFromMode, snapVerdict } from '../lib/lognormal'
	import type { HistoryEntry, ImportedTicket } from '../lib/types'

	interface Props {
		mu: number
		sigma: number
		peerEstimates: Array<{ mu: number; sigma: number; color: string; name: string }>
		revealed: boolean
		userName: string
		history: HistoryEntry[]
		persistentHistory: HistoryEntry[]
		unit: string
		currentTicket?: ImportedTicket
		onEstimateChange: (mu: number, sigma: number) => void
		dataTour?: string
		selfAbstained?: boolean
		hasMoved?: boolean
		hasEverDragged?: boolean
		verdictOverride?: number | null
		showAbstainButton?: boolean
		onAbstain?: () => void
	}

	let { mu, sigma, peerEstimates, revealed, userName, history, persistentHistory, unit, currentTicket, onEstimateChange, dataTour, selfAbstained, hasMoved, hasEverDragged, verdictOverride, showAbstainButton, onAbstain }: Props = $props()

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
		if (revealed) return
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

		// Check own blob first (skip if abstained — no blob to hover)
		if (!selfAbstained && hitTestBlob(mu, sigma, px, py, width, height)) {
			tooltipText = userName ? `${userName} (you)` : 'Mine'
			if (revealed) tooltipText += combinedTooltipSuffix()
			tooltipX = e.clientX - rect.left
			tooltipY = e.clientY - rect.top
			showTooltip = true
			return
		}

		// Check peer blobs (only when revealed)
		if (revealed) {
			for (const peer of peerEstimates) {
				if (hitTestBlob(peer.mu, peer.sigma, px, py, width, height)) {
					tooltipText = peer.name + combinedTooltipSuffix()
					tooltipX = e.clientX - rect.left
					tooltipY = e.clientY - rect.top
					showTooltip = true
					return
				}
			}

			// Check combined blob outline area (outside individual blobs)
			const selfEst = selfAbstained ? [] : [{ mu, sigma }]
			const peerEsts = peerEstimates.map((p) => ({ mu: p.mu, sigma: p.sigma }))
			const combined = combineEstimates([...selfEst, ...peerEsts])
			if (combined && hitTestBlob(combined.mu, combined.sigma, px, py, width, height)) {
				tooltipText = 'Combined' + combinedTooltipSuffix()
				tooltipX = e.clientX - rect.left
				tooltipY = e.clientY - rect.top
				showTooltip = true
				return
			}
		}

		showTooltip = false
	}

	function combinedTooltipSuffix(): string {
		const selfEst = selfAbstained ? [] : [{ mu, sigma }]
		const peerEsts = peerEstimates.map((p) => ({ mu: p.mu, sigma: p.sigma }))
		const combined = combineEstimates([...selfEst, ...peerEsts])
		if (!combined) return ''
		const median = lognormalQuantile(0.5, combined.mu, combined.sigma)
		const p10 = lognormalQuantile(0.1, combined.mu, combined.sigma)
		const p90 = lognormalQuantile(0.9, combined.mu, combined.sigma)
		const fmt = (v: number) => v < 10 ? v.toFixed(1) : Math.round(v).toString()
		return ` · ~${fmt(median)} ${unit} (80%: ${fmt(p10)}–${fmt(p90)})`
	}

	function handlePointerLeave() {
		showTooltip = false
	}

	function updateEstimate(e: PointerEvent) {
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		const canvasX = (e.clientX - rect.left) / rect.width * width
		const canvasY = (e.clientY - rect.top) / rect.height * height

		const desiredMode = Math.max(0.5, canvasToMathX(canvasX, width))
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

		const w = width
		const h = height
		// Read all reactive props before any early return — Svelte only tracks synchronous reads
		const abstained = selfAbstained ?? false
		const moved = hasMoved ?? true
		const everDragged = hasEverDragged ?? true
		const vOverride = verdictOverride ?? null

		// Set buffer size and draw synchronously to avoid race conditions
		// between ResizeObserver and requestAnimationFrame
		if (canvas.width !== w) canvas.width = w
		if (canvas.height !== h) canvas.height = h

		drawScene(ctx, w, h, {
			myEstimate: { mu, sigma },
			peerEstimates,
			revealed,
			history,
			unit,
			currentTicket,
			persistentHistory,
			selfAbstained: abstained,
			hasMoved: moved,
			hasEverDragged: everDragged,
			verdictOverride: vOverride,
		})
	})
</script>

<div class="canvas-container" bind:this={container} data-tour={dataTour}>
	<canvas
		bind:this={canvas}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointerleave={handlePointerLeave}
		style="cursor: {revealed ? 'default' : dragging ? 'grabbing' : 'crosshair'}; touch-action: none;"
	></canvas>
	{#if showTooltip}
		<div class="tooltip" style="left: {tooltipX}px; top: {tooltipY - 30}px;">
			{tooltipText}
		</div>
	{/if}
	{#if showAbstainButton && !selfAbstained}
		<button class="no-idea-btn" onclick={() => onAbstain?.()}>No idea 🤷</button>
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

	.no-idea-btn {
		position: absolute;
		bottom: 16px;
		right: 16px;
		padding: 8px 18px;
		border: 1.5px dashed #c0b89a;
		border-radius: 3px;
		background: rgba(245, 240, 230, 0.7);
		color: #8a8070;
		font-family: 'Caveat', cursive;
		font-size: 1.15rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
		z-index: 2;
	}

	.no-idea-btn:hover {
		background: rgba(245, 240, 230, 0.9);
		color: #5a5040;
		border-color: #a09880;
	}
</style>
