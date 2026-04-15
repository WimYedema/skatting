<script lang="ts">
	import { lognormalPdf } from '../lib/lognormal'

	interface Props {
		userName: string
		onDismiss: () => void
	}

	let { userName, onDismiss }: Props = $props()

	type Step = 'welcome' | 'canvas' | 'ready' | 'room'

	const TOUR_STEPS: { id: Step; selector: string; title: string; text: string; position: 'bottom' | 'top' | 'left' }[] = [
		{
			id: 'canvas',
			selector: '[data-tour="canvas"]',
			title: 'This is your canvas',
			text: 'Drag to place your blob. Left–right = effort, up–down = how sure you are.',
			position: 'top',
		},
		{
			id: 'ready',
			selector: '[data-tour="ready"]',
			title: 'Happy with your guess?',
			text: 'Hit Ready. Once everyone\'s in, all blobs pop up at once.',
			position: 'bottom',
		},
		{
			id: 'room',
			selector: '[data-tour="room"]',
			title: 'Invite the crew',
			text: 'Tap to copy the room code — share it and they\'re in.',
			position: 'bottom',
		},
	]

	let step = $state<Step>('welcome')
	let spotlightRect = $state<DOMRect | null>(null)
	let tooltipStyle = $state('')

	function startTour() {
		step = 'canvas'
		positionStep()
	}

	function nextStep() {
		const idx = TOUR_STEPS.findIndex((s) => s.id === step)
		if (idx < TOUR_STEPS.length - 1) {
			step = TOUR_STEPS[idx + 1].id
			positionStep()
		} else {
			onDismiss()
		}
	}

	function positionStep() {
		const tourStep = TOUR_STEPS.find((s) => s.id === step)
		if (!tourStep) return

		const el = document.querySelector(tourStep.selector)
		if (!el) {
			// Element not visible (e.g., no ready button yet) — skip
			nextStep()
			return
		}

		const rect = el.getBoundingClientRect()
		spotlightRect = rect

		const pad = 12
		if (tourStep.position === 'bottom') {
			tooltipStyle = `top: ${rect.bottom + pad}px; left: ${rect.left + rect.width / 2}px; transform: translateX(-50%);`
		} else if (tourStep.position === 'top') {
			tooltipStyle = `bottom: ${window.innerHeight - rect.top + pad}px; left: ${rect.left + rect.width / 2}px; transform: translateX(-50%);`
		} else {
			tooltipStyle = `top: ${rect.top + rect.height / 2}px; right: ${window.innerWidth - rect.left + pad}px; transform: translateY(-50%);`
		}
	}

	let currentTourStep = $derived(TOUR_STEPS.find((s) => s.id === step))
	let tourIndex = $derived(TOUR_STEPS.findIndex((s) => s.id === step))

	// Generate an SVG path from the log-normal PDF
	// Maps math-space PDF to a viewBox region, returns a closed path string
	function blobPath(
		mu: number,
		sigma: number,
		originX: number,
		baseY: number,
		scaleX: number,
		scaleY: number,
	): string {
		const mode = Math.exp(mu - sigma ** 2)
		const mean = Math.exp(mu + sigma ** 2 / 2)
		const xMax = mean + 3 * Math.sqrt((Math.exp(sigma ** 2) - 1) * Math.exp(2 * mu + sigma ** 2))
		const xMin = Math.max(mode * 0.02, 1e-4)
		const n = 60
		const step = (xMax - xMin) / (n - 1)
		const pts: string[] = []
		for (let i = 0; i < n; i++) {
			const x = xMin + i * step
			const y = lognormalPdf(x, mu, sigma)
			const sx = originX + x * scaleX
			const sy = baseY - y * scaleY
			pts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`)
		}
		// Close along baseline
		const xEnd = originX + (xMin + (n - 1) * step) * scaleX
		const xStart = originX + xMin * scaleX
		return `M${xStart.toFixed(1)},${baseY} L${pts.join(' L')} L${xEnd.toFixed(1)},${baseY} Z`
	}

	// Narrow blob: low sigma (certain), small effort — top-left area
	const narrowPath = blobPath(0.7, 0.35, 25, 108, 26, 160)
	// Wide blob: high sigma (uncertain), larger effort — bottom-right area
	const widePath = blobPath(1.6, 0.55, 25, 108, 22, 85)
</script>

{#if step === 'welcome'}
	<!-- Welcome modal -->
	<div class="overlay" role="dialog" aria-label="Welcome">
		<div class="welcome-card">
			<h2>Hey {userName}! First time here?</h2>
			<div class="concept">
				<svg class="axis-diagram" viewBox="0 0 200 120" aria-hidden="true">
					<!-- Axes -->
					<line x1="20" y1="5" x2="20" y2="110" stroke="#5a5040" stroke-width="1.5"/>
					<line x1="20" y1="110" x2="195" y2="110" stroke="#5a5040" stroke-width="1.5"/>
					<!-- Axis labels -->
					<text x="7" y="14" font-size="10" fill="#8a8070" text-anchor="end" font-family="Caveat, cursive">← sure</text>
					<text x="7" y="106" font-size="10" fill="#8a8070" text-anchor="end" font-family="Caveat, cursive">unsure</text>
					<text x="24" y="120" font-size="10" fill="#8a8070" font-family="Caveat, cursive">tiny</text>
					<text x="192" y="120" font-size="10" fill="#8a8070" text-anchor="end" font-family="Caveat, cursive">huge →</text>
					<!-- Narrow blob (high certainty) — actual log-normal PDF -->
					<path d={narrowPath}
						fill="rgba(91,123,154,0.25)" stroke="rgba(91,123,154,0.5)" stroke-width="1.2"/>
					<!-- Wide blob (low certainty) — actual log-normal PDF -->
					<path d={widePath}
						fill="rgba(154,123,91,0.25)" stroke="rgba(154,123,91,0.5)" stroke-width="1.2"/>
				</svg>
				<p>
					Drag a blob on a 2D canvas.<br />
					<strong>→</strong> how big is it?<br />
					<strong>↑</strong> how sure are you?
				</p>
				<p class="detail">
					Sure? Blob goes tall & narrow. Guessing? It spreads out. Same area either way — that's the trick.
				</p>
			</div>
			<div class="actions">
				<button class="tour-btn" onclick={startTour}>Quick tour ↝</button>
				<button class="skip-btn" onclick={onDismiss}>I'll figure it out</button>
			</div>
		</div>
	</div>
{:else if currentTourStep && spotlightRect}
	<!-- Spotlight tour -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay tour-overlay" onclick={nextStep}>
		<div
			class="spotlight"
			style="
				top: {spotlightRect.top - 6}px;
				left: {spotlightRect.left - 6}px;
				width: {spotlightRect.width + 12}px;
				height: {spotlightRect.height + 12}px;
			"
		></div>
		<div class="tour-tooltip" style={tooltipStyle} onclick={(e) => e.stopPropagation()}>
			<div class="tour-title">{currentTourStep.title}</div>
			<div class="tour-text">{currentTourStep.text}</div>
			<div class="tour-nav">
				<span class="tour-dots">
					{#each TOUR_STEPS as _, i}
						<span class="dot" class:active={i === tourIndex}></span>
					{/each}
				</span>
				<button class="tour-next" onclick={nextStep}>
					{tourIndex < TOUR_STEPS.length - 1 ? 'Next' : 'Got it!'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.overlay:not(.tour-overlay) {
		background: rgba(58, 53, 48, 0.55);
	}

	.tour-overlay {
		background: rgba(58, 53, 48, 0.45);
	}

	.welcome-card {
		background: #f5f0e6;
		border: 1px dashed #b0a890;
		border-radius: 6px;
		padding: 28px 36px;
		max-width: 440px;
		width: 90%;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
		font-family: 'Caveat', cursive;
	}

	.welcome-card h2 {
		margin: 0 0 16px;
		font-size: 1.7rem;
		font-weight: 700;
		color: #3a3530;
	}

	.concept p {
		font-size: 1.15rem;
		line-height: 1.4;
		color: #3a3530;
		margin: 10px 0;
	}

	.concept .detail {
		font-size: 1rem;
		color: #6a6050;
	}

	.axis-diagram {
		display: block;
		width: 240px;
		height: 130px;
		margin: 0 auto 12px;
	}

	.actions {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-top: 18px;
	}

	.tour-btn {
		padding: 10px 24px;
		border: 1px dashed #8a9ab0;
		border-radius: 3px;
		background: rgba(59, 125, 216, 0.2);
		color: #2a5090;
		font-family: 'Caveat', cursive;
		font-size: 1.15rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tour-btn:hover {
		background: rgba(59, 125, 216, 0.35);
	}

	.skip-btn {
		padding: 10px 24px;
		border: 1px dashed #b0a890;
		border-radius: 3px;
		background: rgba(160, 150, 130, 0.15);
		color: #8a8070;
		font-family: 'Caveat', cursive;
		font-size: 1.1rem;
		cursor: pointer;
	}

	.skip-btn:hover {
		background: rgba(160, 150, 130, 0.3);
	}

	/* Tour spotlight */
	.spotlight {
		position: fixed;
		border-radius: 6px;
		box-shadow: 0 0 0 9999px rgba(58, 53, 48, 0.45);
		pointer-events: none;
		z-index: 101;
	}

	.tour-tooltip {
		position: fixed;
		z-index: 102;
		background: #f5f0e6;
		border: 1px dashed #b0a890;
		border-radius: 6px;
		padding: 14px 20px;
		max-width: 320px;
		box-shadow: 0 3px 16px rgba(0, 0, 0, 0.12);
		font-family: 'Caveat', cursive;
	}

	.tour-title {
		font-size: 1.2rem;
		font-weight: 700;
		color: #3a3530;
		margin-bottom: 4px;
	}

	.tour-text {
		font-size: 1.05rem;
		color: #5a5040;
		line-height: 1.35;
	}

	.tour-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 10px;
	}

	.tour-dots {
		display: flex;
		gap: 6px;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #c0b89a;
	}

	.dot.active {
		background: #3b7dd8;
	}

	.tour-next {
		padding: 6px 16px;
		border: 1px dashed #8a9ab0;
		border-radius: 3px;
		background: rgba(59, 125, 216, 0.2);
		color: #2a5090;
		font-family: 'Caveat', cursive;
		font-size: 1.05rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tour-next:hover {
		background: rgba(59, 125, 216, 0.35);
	}
</style>
