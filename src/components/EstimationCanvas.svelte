<script lang="ts">
	import { canvasToMathX, canvasYToSigma, drawScene, sigmaToCanvasY, mathToCanvasX } from '../lib/canvas'

	interface Props {
		mu: number
		sigma: number
		peerEstimates: Array<{ mu: number; sigma: number; color: string }>
		revealed: boolean
		onEstimateChange: (mu: number, sigma: number) => void
	}

	let { mu, sigma, peerEstimates, revealed, onEstimateChange }: Props = $props()

	let canvas: HTMLCanvasElement | undefined = $state()
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
		const canvasX = e.clientX - rect.left
		const canvasY = e.clientY - rect.top

		const newMu = Math.max(0.1, canvasToMathX(canvasX, width))
		const newSigma = canvasYToSigma(canvasY, height)
		onEstimateChange(newMu, newSigma)
	}

	function resizeCanvas() {
		if (!canvas) return
		const parent = canvas.parentElement
		if (!parent) return
		width = parent.clientWidth
		height = Math.max(300, Math.min(parent.clientHeight, window.innerHeight - 120))
	}

	$effect(() => {
		if (!canvas) return
		resizeCanvas()
		const observer = new ResizeObserver(() => resizeCanvas())
		observer.observe(canvas.parentElement!)
		return () => observer.disconnect()
	})

	$effect(() => {
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		// This $effect automatically re-runs when mu, sigma, peerEstimates, or revealed change
		requestAnimationFrame(() => {
			drawScene(ctx, width, height, { mu, sigma }, peerEstimates, revealed)

			// Draw crosshair at current estimate position
			const cx = mathToCanvasX(mu, width)
			const cy = sigmaToCanvasY(sigma, height)
			ctx.save()
			ctx.strokeStyle = '#3b82f6'
			ctx.lineWidth = 1.5
			ctx.setLineDash([4, 4])
			ctx.beginPath()
			ctx.moveTo(cx - 12, cy)
			ctx.lineTo(cx + 12, cy)
			ctx.moveTo(cx, cy - 12)
			ctx.lineTo(cx, cy + 12)
			ctx.stroke()
			ctx.setLineDash([])
			ctx.restore()
		})
	})
</script>

<div class="canvas-container">
	<canvas
		bind:this={canvas}
		{width}
		{height}
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
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		background: #0f172a;
		border-radius: 8px;
	}
</style>
