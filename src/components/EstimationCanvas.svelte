<script lang="ts">
	import { canvasToMathX, canvasYToSigmaFromPeak, drawScene, mathToCanvasX } from '../lib/canvas'
	import { lognormalMode, muFromMode } from '../lib/lognormal'

	interface Props {
		mu: number
		sigma: number
		peerEstimates: Array<{ mu: number; sigma: number; color: string }>
		revealed: boolean
		onEstimateChange: (mu: number, sigma: number) => void
	}

	let { mu, sigma, peerEstimates, revealed, onEstimateChange }: Props = $props()

	let canvas: HTMLCanvasElement | undefined = $state()
	let container: HTMLDivElement | undefined = $state()
	let width = $state(800)
	let height = $state(500)
	let dragging = $state(false)

	function handlePointerDown(e: PointerEvent) {
		dragging = true
		;(e.target as HTMLElement).setPointerCapture(e.pointerId)
		updateEstimate(e)
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return
		updateEstimate(e)
	}

	function handlePointerUp() {
		dragging = false
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
		const w = width
		const h = height

		// Set buffer size and draw synchronously to avoid race conditions
		// between ResizeObserver and requestAnimationFrame
		if (canvas.width !== w) canvas.width = w
		if (canvas.height !== h) canvas.height = h

		drawScene(ctx, w, h, { mu: currentMu, sigma: currentSigma }, currentPeers, currentRevealed)

		// Draw a vertical dashed line at the mode (peak) x-position
		const mode = lognormalMode(currentMu, currentSigma)
		const cx = mathToCanvasX(mode, w)
		ctx.save()
		ctx.strokeStyle = '#3b82f6'
		ctx.lineWidth = 1.5
		ctx.setLineDash([4, 4])
		ctx.beginPath()
		ctx.moveTo(cx, 40)
		ctx.lineTo(cx, h - 40)
		ctx.stroke()
		ctx.setLineDash([])
		ctx.restore()
	})
</script>

<div class="canvas-container" bind:this={container}>
	<canvas
		bind:this={canvas}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		style="cursor: {dragging ? 'grabbing' : 'crosshair'}; touch-action: none;"
	></canvas>
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
		background: #0f172a;
		border-radius: 8px;
	}
</style>
