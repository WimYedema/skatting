<script lang="ts">
	import {
		canvasToMathX,
		canvasYToSigmaFromPeak,
		drawScene,
		hitTestBlob,
		hitTestGrabHandle,
		mathToCanvasX,
	} from '../lib/canvas'
	import { combineEstimates, collectEstimates, lognormalQuantile, muFromMode } from '../lib/lognormal'
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
		liveAdjust?: boolean
		isCreator?: boolean
		conclusionMode?: number | null
		conclusionSigma?: number | null
		onConclusionChange?: (mode: number, sigma: number) => void
		showAbstainButton?: boolean
		onAbstain?: () => void
	}

	let { mu, sigma, peerEstimates, revealed, userName, history, persistentHistory, unit, currentTicket, onEstimateChange, dataTour, selfAbstained, hasMoved, hasEverDragged, liveAdjust, isCreator, conclusionMode, conclusionSigma, onConclusionChange, showAbstainButton, onAbstain }: Props = $props()

	let canvas: HTMLCanvasElement | undefined = $state()
	let container: HTMLDivElement | undefined = $state()
	let width = $state(800)
	let height = $state(500)
	let dragging = $state(false)
	let draggingConclusion = $state(false)

	let tooltipText = $state('')
	let tooltipX = $state(0)
	let tooltipY = $state(0)
	let showTooltip = $state(false)
	let hoverHandle = $state(false)
	let redrawTick = $state(0)

	// Force canvas redraw when tab becomes visible — browsers discard canvas
	// bitmaps for backgrounded tabs, so the $effect must re-run on focus.
	$effect(() => {
		const onVisible = () => {
			if (document.visibilityState === 'visible') redrawTick++
		}
		document.addEventListener('visibilitychange', onVisible)
		return () => document.removeEventListener('visibilitychange', onVisible)
	})

	function handlePointerDown(e: PointerEvent) {
		if (!revealed) {
			// Pre-reveal: drag own blob
			dragging = true
			;(e.target as HTMLElement).setPointerCapture(e.pointerId)
			updateEstimate(e)
			return
		}
		// Post-reveal locked: facilitator drags conclusion curve
		if (!liveAdjust && isCreator && onConclusionChange) {
			draggingConclusion = true
			;(e.target as HTMLElement).setPointerCapture(e.pointerId)
			updateConclusion(e)
			return
		}
		// Post-reveal unlocked: everyone drags own blob
		if (liveAdjust) {
			dragging = true
			;(e.target as HTMLElement).setPointerCapture(e.pointerId)
			updateEstimate(e)
			return
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (draggingConclusion) {
			updateConclusion(e)
			showTooltip = false
			return
		}
		if (dragging) {
			updateEstimate(e)
			showTooltip = false
			return
		}
		updateHoverHandle(e)
		updateTooltip(e)
	}

	function handlePointerUp() {
		dragging = false
		draggingConclusion = false
	}

	function updateTooltip(e: PointerEvent) {
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		const px = ((e.clientX - rect.left) / rect.width) * width
		const py = ((e.clientY - rect.top) / rect.height) * height

		// Check own blob first (skip if abstained — no blob to hover)
		if (!selfAbstained && hitTestBlob(mu, sigma, px, py, width, height)) {
			tooltipText = (userName ? `${userName} (you)` : 'Mine')
			if (revealed) tooltipText += estimateTooltipSuffix(mu, sigma)
			tooltipX = e.clientX - rect.left
			tooltipY = e.clientY - rect.top
			showTooltip = true
			return
		}

		// Check peer blobs (only when revealed)
		if (revealed) {
			for (const peer of peerEstimates) {
				if (hitTestBlob(peer.mu, peer.sigma, px, py, width, height)) {
					tooltipText = peer.name + estimateTooltipSuffix(peer.mu, peer.sigma)
					tooltipX = e.clientX - rect.left
					tooltipY = e.clientY - rect.top
					showTooltip = true
					return
				}
			}

			// Check combined blob outline area (outside individual blobs)
			const combined = combineEstimates(collectEstimates({ mu, sigma }, peerEstimates, selfAbstained ?? false))
			if (combined && hitTestBlob(combined.mu, combined.sigma, px, py, width, height)) {
				tooltipText = 'Combined' + estimateTooltipSuffix(combined.mu, combined.sigma)
				tooltipX = e.clientX - rect.left
				tooltipY = e.clientY - rect.top
				showTooltip = true
				return
			}
		}

		showTooltip = false
	}

	function estimateTooltipSuffix(emu: number, esigma: number): string {
		const median = lognormalQuantile(0.5, emu, esigma)
		const p10 = lognormalQuantile(0.1, emu, esigma)
		const p90 = lognormalQuantile(0.9, emu, esigma)
		const fmt = (v: number) => v < 10 ? v.toFixed(1) : Math.round(v).toString()
		return ` · ~${fmt(median)} ${unit} (80%: ${fmt(p10)}–${fmt(p90)})`
	}

	function combinedTooltipSuffix(): string {
		const combined = combineEstimates(collectEstimates({ mu, sigma }, peerEstimates, selfAbstained ?? false))
		if (!combined) return ''
		return estimateTooltipSuffix(combined.mu, combined.sigma)
	}

	function handlePointerLeave() {
		showTooltip = false
		hoverHandle = false
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

	function updateConclusion(e: PointerEvent) {
		if (!canvas || !onConclusionChange) return
		const rect = canvas.getBoundingClientRect()
		const canvasX = (e.clientX - rect.left) / rect.width * width
		const canvasY = (e.clientY - rect.top) / rect.height * height
		const mode = Math.max(0.5, canvasToMathX(canvasX, width))
		const sigma = canvasYToSigmaFromPeak(canvasY, height, mode)
		onConclusionChange(mode, sigma)
	}

	function updateHoverHandle(e: PointerEvent) {
		if (!canvas) return
		const canDrag = !revealed || (liveAdjust ?? false)
		if (!canDrag && !(revealed && isCreator)) {
			hoverHandle = false
			return
		}
		const rect = canvas.getBoundingClientRect()
		const px = ((e.clientX - rect.left) / rect.width) * width
		const py = ((e.clientY - rect.top) / rect.height) * height
		if (canDrag && !(selfAbstained ?? false)) {
			hoverHandle = hitTestGrabHandle(mu, sigma, px, py, width, height)
		} else if (revealed && isCreator) {
			const hMu = conclusionMode != null && conclusionSigma != null
				? muFromMode(conclusionMode, conclusionSigma)
				: mu
			const hSigma = conclusionSigma ?? sigma
			hoverHandle = hitTestGrabHandle(hMu, hSigma, px, py, width, height)
		}
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
		const la = liveAdjust ?? false
		void redrawTick // Force redraw when tab regains visibility

		// Set buffer size and draw synchronously to avoid race conditions
		// between ResizeObserver and requestAnimationFrame
		if (canvas.width !== w) canvas.width = w
		if (canvas.height !== h) canvas.height = h

		const cMode = conclusionMode ?? null
		const cSigma = conclusionSigma ?? null
		const creator = isCreator ?? false

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
			liveAdjust: la,
			conclusionMode: cMode,
			conclusionSigma: cSigma,
			isCreator: creator,
			hoverHandle,
			isDragging: dragging || draggingConclusion,
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
		style="cursor: {dragging || draggingConclusion ? 'grabbing' : hoverHandle ? 'grab' : !revealed ? 'crosshair' : liveAdjust ? 'crosshair' : isCreator ? 'grab' : 'default'}; touch-action: none;"
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
		background: var(--c-surface);
		border: 1px dashed var(--c-border);
		border-radius: var(--radius-sm);
	}

	.tooltip {
		position: absolute;
		pointer-events: none;
		font-family: var(--font);
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--c-text);
		background: rgba(245, 240, 230, 0.9);
		border: 1px dashed var(--c-border);
		border-radius: var(--radius-sm);
		padding: 2px 8px;
		white-space: nowrap;
		transform: translateX(-50%);
	}

	.no-idea-btn {
		position: absolute;
		bottom: 16px;
		right: 16px;
		padding: var(--sp-sm) 18px;
		border: 1.5px dashed var(--c-border);
		border-radius: var(--radius-sm);
		background: rgba(245, 240, 230, 0.7);
		color: var(--c-text-muted);
		font-family: var(--font);
		font-size: 1.15rem;
		font-weight: 600;
		cursor: pointer;
		transition: background var(--tr-fast), color var(--tr-fast);
		z-index: 2;
	}

	.no-idea-btn:hover {
		background: rgba(245, 240, 230, 0.9);
		color: #5a5040;
		border-color: #a09880;
	}
</style>
