<script lang="ts">
	import { lognormalPdf } from '../lib/lognormal'

	interface Props {
		onClose: () => void
	}

	let { onClose }: Props = $props()

	// Generate SVG path data for a lognormal blob
	function blobPath(
		mu: number,
		sigma: number,
		opts: { width: number; height: number; baseline: number; padLeft: number; padRight: number; xMin: number; xMax: number; scale?: number },
	): string {
		const { width, height, baseline, padLeft, padRight, xMin, xMax, scale = 1 } = opts
		const drawW = width - padLeft - padRight
		const logMin = Math.log(Math.max(xMin, 0.01))
		const logMax = Math.log(xMax)
		const numPoints = 150

		const points: Array<{ px: number; py: number }> = []
		let maxY = 0
		const raw: Array<{ x: number; y: number }> = []
		for (let i = 0; i < numPoints; i++) {
			const frac = i / (numPoints - 1)
			const x = Math.exp(logMin + frac * (logMax - logMin))
			const y = lognormalPdf(x, mu, sigma)
			raw.push({ x, y })
			if (y > maxY) maxY = y
		}

		const yScale = maxY > 0 ? ((baseline - 20) * 0.85 * scale) / maxY : 1
		for (const { x, y } of raw) {
			const logFrac = (Math.log(x) - logMin) / (logMax - logMin)
			const px = padLeft + logFrac * drawW
			const py = baseline - y * yScale
			points.push({ px, py })
		}

		if (points.length === 0) return ''
		let d = `M${points[0].px.toFixed(1)},${baseline}`
		for (const p of points) {
			d += ` L${p.px.toFixed(1)},${p.py.toFixed(1)}`
		}
		d += ` L${points[points.length - 1].px.toFixed(1)},${baseline} Z`
		return d
	}

	// Tick positions for log-scale x-axis
	function tickX(value: number, padLeft: number, padRight: number, width: number, xMin: number, xMax: number): number {
		const drawW = width - padLeft - padRight
		const logMin = Math.log(Math.max(xMin, 0.01))
		const logMax = Math.log(xMax)
		const frac = (Math.log(value) - logMin) / (logMax - logMin)
		return padLeft + frac * drawW
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="brief-overlay" onclick={onClose}>
	<div class="brief" onclick={(e) => e.stopPropagation()}>
		<button class="close" onclick={onClose}>×</button>

		<!-- HERO -->
		<section class="hero">
			<h1>What if estimates could show uncertainty?</h1>
			<p class="subtitle">Planning poker gives you a number. Skatting gives you the whole picture.</p>
		</section>

		<!-- THE PROBLEM -->
		<section class="section">
			<h2>The problem with planning poker</h2>
			<div class="comparison">
				<div class="compare-card poker">
					<svg viewBox="0 0 140 190" aria-label="A planning poker card showing the number 5">
						<defs>
							<pattern id="card-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
								<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(90,80,64,0.15)" stroke-width="0.5"/>
							</pattern>
						</defs>
						<rect x="4" y="4" width="132" height="182" rx="10" fill="#f5f0e6" stroke="#c0b89a" stroke-width="1.5"/>
						<rect x="4" y="4" width="132" height="182" rx="10" fill="url(#card-hatch)"/>
						<!-- ruled lines -->
						<line x1="20" y1="50" x2="120" y2="50" stroke="rgba(140,180,210,0.2)" stroke-width="0.5"/>
						<line x1="20" y1="90" x2="120" y2="90" stroke="rgba(140,180,210,0.2)" stroke-width="0.5"/>
						<line x1="20" y1="130" x2="120" y2="130" stroke="rgba(140,180,210,0.2)" stroke-width="0.5"/>
						<text x="70" y="115" text-anchor="middle" font-family="Caveat, cursive" font-size="64" font-weight="700" fill="#5a5040">5</text>
						<text x="70" y="160" text-anchor="middle" font-family="Caveat, cursive" font-size="14" fill="#8a8070">points</text>
					</svg>
					<p class="compare-label">"It's a 5"</p>
					<p class="compare-note">But how sure are you? The card doesn't say.</p>
				</div>
				<div class="compare-arrow">→</div>
				<div class="compare-card blob-card">
					<svg viewBox="0 0 260 190" aria-label="A blob on a 2D plane showing both estimate and uncertainty">
						<defs>
							<pattern id="blob-hatch-demo" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
								<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(59,125,216,0.6)" stroke-width="0.6"/>
							</pattern>
						</defs>
						<rect x="2" y="2" width="256" height="186" rx="6" fill="#f5f0e6" stroke="#c0b89a" stroke-width="1"/>
						<!-- axes -->
						<line x1="35" y1="160" x2="245" y2="160" stroke="#5a5040" stroke-width="1"/>
						<line x1="35" y1="160" x2="35" y2="15" stroke="#5a5040" stroke-width="1"/>
						<!-- tick marks -->
						{#each [1, 2, 3, 5, 8, 13, 21] as v}
							{@const tx = tickX(v, 35, 15, 260, 0.5, 30)}
							<line x1={tx} y1="160" x2={tx} y2="164" stroke="#5a5040" stroke-width="0.8"/>
							<text x={tx} y="175" text-anchor="middle" font-family="Caveat, cursive" font-size="10" fill="#6a6050">{v}</text>
						{/each}
						<!-- axis labels -->
						<text x="140" y="188" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="#6a6050">points</text>
						<text x="8" y="90" text-anchor="middle" font-family="Caveat, cursive" font-size="10" fill="#b8b0a0" transform="rotate(-90, 8, 90)">certainty</text>
						<!-- the blob -->
						<path d={blobPath(1.6, 0.35, { width: 260, height: 190, baseline: 160, padLeft: 35, padRight: 15, xMin: 0.5, xMax: 30, scale: 0.9 })}
							fill="url(#blob-hatch-demo)" stroke="rgba(59,125,216,0.7)" stroke-width="1.5" opacity="0.6"/>
					</svg>
					<p class="compare-label">"Around 5, and I'm fairly sure"</p>
					<p class="compare-note">Position = estimate. Height = certainty. Shape = realistic uncertainty.</p>
				</div>
			</div>
		</section>

		<!-- THE INSIGHT -->
		<section class="section">
			<h2>Why a blob, not a dot?</h2>
			<p>
				Software estimates follow a <em>log-normal distribution</em>: they can't go below zero,
				and overruns are more likely than underruns. The blob shape <strong>is</strong> the math —
				its right tail stretches further because "it could take 3× longer" is far more realistic
				than "it could take ⅓ the time."
			</p>
			<p>
				The blob has a <strong>fixed area</strong>. Drag it higher and it gets tall and narrow
				("I'm certain"). Drag it lower and it spreads wide ("I really don't know"). This one
				constraint captures the fundamental trade-off between precision and confidence.
			</p>
		</section>

		<!-- THE INTERACTION -->
		<section class="section">
			<h2>Two dimensions, one gesture</h2>
			<div class="blob-examples">
				<svg viewBox="0 0 520 220" aria-label="Two example blobs showing high certainty vs low certainty">
					<defs>
						<pattern id="hatch-blue" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(59,125,216,0.6)" stroke-width="0.6"/>
						</pattern>
						<pattern id="hatch-orange" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(180,120,40,0.6)" stroke-width="0.6"/>
						</pattern>
					</defs>
					<rect x="2" y="2" width="516" height="216" rx="6" fill="#f5f0e6" stroke="#c0b89a" stroke-width="1"/>
					<!-- Axes -->
					<line x1="45" y1="190" x2="505" y2="190" stroke="#5a5040" stroke-width="1"/>
					<line x1="45" y1="190" x2="45" y2="15" stroke="#5a5040" stroke-width="1"/>
					{#each [1, 2, 3, 5, 8, 13, 21, 34] as v}
						{@const tx = tickX(v, 45, 15, 520, 0.5, 55)}
						<line x1={tx} y1="190" x2={tx} y2="194" stroke="#5a5040" stroke-width="0.8"/>
						<text x={tx} y="207" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="#6a6050">{v}</text>
					{/each}
					<text x="275" y="220" text-anchor="middle" font-family="Caveat, cursive" font-size="12" fill="#6a6050">points</text>
					<!-- Certainty labels -->
					<text x="42" y="180" text-anchor="end" font-family="Caveat, cursive" font-size="10" fill="#b8b0a0">don't ask…</text>
					<text x="42" y="130" text-anchor="end" font-family="Caveat, cursive" font-size="10" fill="#b8b0a0">gut feeling</text>
					<text x="42" y="75" text-anchor="end" font-family="Caveat, cursive" font-size="10" fill="#b8b0a0">pretty sure</text>
					<text x="42" y="28" text-anchor="end" font-family="Caveat, cursive" font-size="10" fill="#b8b0a0">I know this!</text>

					<!-- High certainty blob (mu=1.1, sigma=0.25) — "~3 points, very sure" -->
					<path d={blobPath(1.1, 0.25, { width: 520, height: 220, baseline: 190, padLeft: 45, padRight: 15, xMin: 0.5, xMax: 55 })}
						fill="url(#hatch-blue)" stroke="rgba(59,125,216,0.7)" stroke-width="1.5" opacity="0.55"/>
					<!-- Annotation -->
					<text x="150" y="38" font-family="Caveat, cursive" font-size="13" fill="#2a5090">
						"~3 points, I'm sure"
					</text>
					<line x1="150" y1="42" x2="135" y2="70" stroke="#2a5090" stroke-width="0.8" stroke-dasharray="3,2"/>

					<!-- Low certainty blob (mu=2.2, sigma=0.7) — "maybe 8ish, but who knows" -->
					<path d={blobPath(2.2, 0.7, { width: 520, height: 220, baseline: 190, padLeft: 45, padRight: 15, xMin: 0.5, xMax: 55 })}
						fill="url(#hatch-orange)" stroke="rgba(180,120,40,0.7)" stroke-width="1.5" opacity="0.45"/>
					<!-- Annotation -->
					<text x="340" y="110" font-family="Caveat, cursive" font-size="13" fill="#8a6020">
						"maybe 8ish… could be 20"
					</text>
					<line x1="337" y1="113" x2="310" y2="140" stroke="#8a6020" stroke-width="0.8" stroke-dasharray="3,2"/>
				</svg>
			</div>
		</section>

		<!-- THE REVEAL -->
		<section class="section">
			<h2>The reveal: see what your team really thinks</h2>
			<p>
				When everyone is ready, all blobs appear at once. Consensus shows as overlapping shapes.
				Disagreement shows as separate clusters — a signal to <em>talk</em>, not just re-vote.
			</p>
			<div class="blob-examples">
				<svg viewBox="0 0 520 220" aria-label="Three team members' revealed blobs, showing consensus overlap and one outlier">
					<defs>
						<pattern id="hatch-r1" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(59,125,216,0.5)" stroke-width="0.6"/>
						</pattern>
						<pattern id="hatch-r2" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(80,160,80,0.5)" stroke-width="0.6"/>
						</pattern>
						<pattern id="hatch-r3" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(180,100,50,0.5)" stroke-width="0.6"/>
						</pattern>
						<pattern id="hatch-combined" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="3" stroke="rgba(140,80,160,0.5)" stroke-width="0.6"/>
						</pattern>
					</defs>
					<rect x="2" y="2" width="516" height="216" rx="6" fill="#f5f0e6" stroke="#c0b89a" stroke-width="1"/>
					<!-- Axes -->
					<line x1="45" y1="190" x2="505" y2="190" stroke="#5a5040" stroke-width="1"/>
					<line x1="45" y1="190" x2="45" y2="15" stroke="#5a5040" stroke-width="1"/>
					{#each [1, 2, 3, 5, 8, 13, 21, 34] as v}
						{@const tx = tickX(v, 45, 15, 520, 0.5, 55)}
						<line x1={tx} y1="190" x2={tx} y2="194" stroke="#5a5040" stroke-width="0.8"/>
						<text x={tx} y="207" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="#6a6050">{v}</text>
					{/each}

					<!-- Alice: mu=1.5, sigma=0.3 (around 5, fairly sure) -->
					<path d={blobPath(1.5, 0.3, { width: 520, height: 220, baseline: 190, padLeft: 45, padRight: 15, xMin: 0.5, xMax: 55, scale: 0.6 })}
						fill="url(#hatch-r1)" stroke="rgba(59,125,216,0.6)" stroke-width="1.2" opacity="0.5"/>
					<!-- Bob: mu=1.7, sigma=0.35 (around 5-6, sure) -->
					<path d={blobPath(1.7, 0.35, { width: 520, height: 220, baseline: 190, padLeft: 45, padRight: 15, xMin: 0.5, xMax: 55, scale: 0.6 })}
						fill="url(#hatch-r2)" stroke="rgba(80,160,80,0.6)" stroke-width="1.2" opacity="0.5"/>
					<!-- Charlie: mu=2.7, sigma=0.5 (around 13, less sure — outlier) -->
					<path d={blobPath(2.7, 0.5, { width: 520, height: 220, baseline: 190, padLeft: 45, padRight: 15, xMin: 0.5, xMax: 55, scale: 0.6 })}
						fill="url(#hatch-r3)" stroke="rgba(180,100,50,0.6)" stroke-width="1.2" opacity="0.5"/>

					<!-- Labels -->
					<text x="170" y="25" font-family="Caveat, cursive" font-size="12" fill="#2a5090">Alice</text>
					<text x="210" y="25" font-family="Caveat, cursive" font-size="12" fill="#3a7a3a">Bob</text>
					<text x="360" y="70" font-family="Caveat, cursive" font-size="12" fill="#8a5020">Charlie</text>

					<!-- Consensus bracket -->
					<line x1="145" y1="180" x2="230" y2="180" stroke="rgba(100,80,140,0.5)" stroke-width="1.5" stroke-dasharray="4,2"/>
					<text x="187" y="176" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="rgba(100,80,140,0.8)">consensus ✓</text>

					<!-- Outlier annotation -->
					<line x1="360" y1="74" x2="350" y2="110" stroke="#8a5020" stroke-width="0.8" stroke-dasharray="3,2"/>
					<text x="405" y="90" font-family="Caveat, cursive" font-size="11" fill="#8a5020">← let's talk about this</text>
				</svg>
			</div>
		</section>

		<!-- WHY P2P -->
		<section class="section">
			<h2>No server. No accounts. No trace.</h2>
			<div class="features-grid">
				<div class="feature-item">
					<span class="feature-icon">🔗</span>
					<div>
						<strong>Share a link</strong>
						<p>Create a room and send the code. That's it — no sign-up.</p>
					</div>
				</div>
				<div class="feature-item">
					<span class="feature-icon">🔒</span>
					<div>
						<strong>End-to-end encrypted</strong>
						<p>Estimates travel directly between browsers via WebRTC. The room code is the encryption key.</p>
					</div>
				</div>
				<div class="feature-item">
					<span class="feature-icon">📄</span>
					<div>
						<strong>Single HTML file</strong>
						<p>The entire app is one file. Host it yourself, use it offline, fork it freely.</p>
					</div>
				</div>
				<div class="feature-item">
					<span class="feature-icon">🧮</span>
					<div>
						<strong>Real math</strong>
						<p>Combined estimates use proper log-normal statistics — not just averages.</p>
					</div>
				</div>
			</div>
		</section>

		<!-- CTA -->
		<section class="section cta">
			<button class="primary" onclick={onClose}>Start estimating</button>
			<p class="cta-sub">
				<a href="https://github.com/WimYedema/skatting" target="_blank" rel="noopener">View on GitHub</a>
				<span class="sep">·</span>
				MIT License
				<span class="sep">·</span>
				Free forever
			</p>
		</section>
	</div>
</div>

<style>
	.brief-overlay {
		position: fixed;
		inset: 0;
		background: var(--c-overlay);
		z-index: 100;
		overflow-y: auto;
		display: flex;
		justify-content: center;
		padding: var(--sp-xl) var(--sp-md);
	}

	.brief {
		position: relative;
		background: var(--c-surface);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
		max-width: 640px;
		width: 100%;
		padding: var(--sp-2xl) var(--sp-2xl) var(--sp-xl);
		margin-bottom: var(--sp-xl);
		align-self: flex-start;
	}

	.close {
		position: absolute;
		top: var(--sp-sm);
		right: var(--sp-md);
		background: none;
		border: none;
		font-size: var(--fs-2xl);
		color: var(--c-text-muted);
		cursor: pointer;
		line-height: 1;
		padding: var(--sp-xs);
		z-index: 1;
	}

	.close:hover {
		color: var(--c-text);
	}

	/* Hero */
	.hero {
		text-align: center;
		margin-bottom: var(--sp-2xl);
	}

	.hero h1 {
		font-family: var(--font);
		font-size: clamp(1.6rem, 5vw, 2.4rem);
		font-weight: 700;
		color: var(--c-text);
		margin: 0 0 var(--sp-sm);
		line-height: 1.2;
	}

	.subtitle {
		font-family: var(--font);
		font-size: var(--fs-lg);
		color: var(--c-text-soft);
		margin: 0;
	}

	/* Sections */
	.section {
		margin-bottom: var(--sp-2xl);
	}

	.section h2 {
		font-family: var(--font);
		font-size: var(--fs-xl);
		font-weight: 700;
		color: var(--c-text);
		margin: 0 0 var(--sp-md);
	}

	.section p {
		font-family: var(--font);
		font-size: var(--fs-md);
		color: var(--c-text-soft);
		line-height: 1.5;
		margin: 0 0 var(--sp-sm);
	}

	.section em {
		font-style: normal;
		color: var(--c-accent-text);
	}

	.section strong {
		color: var(--c-text);
	}

	/* Comparison */
	.comparison {
		display: flex;
		align-items: center;
		gap: var(--sp-md);
		justify-content: center;
		flex-wrap: wrap;
	}

	.compare-card {
		text-align: center;
		flex-shrink: 0;
	}

	.compare-card svg {
		display: block;
		margin: 0 auto;
	}

	.poker svg {
		width: 100px;
	}

	.blob-card svg {
		width: 220px;
	}

	.compare-label {
		font-family: var(--font);
		font-size: var(--fs-md);
		font-weight: 700;
		color: var(--c-text);
		margin: var(--sp-sm) 0 2px;
	}

	.compare-note {
		font-family: var(--font);
		font-size: var(--fs-sm);
		color: var(--c-text-muted);
		margin: 0;
		max-width: 200px;
	}

	.compare-arrow {
		font-size: 2rem;
		color: var(--c-text-muted);
		font-family: var(--font);
	}

	/* Blob examples */
	.blob-examples svg {
		width: 100%;
		max-width: 520px;
		display: block;
		margin: var(--sp-md) auto;
	}

	/* Features grid */
	.features-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-md);
	}

	@media (max-width: 500px) {
		.features-grid {
			grid-template-columns: 1fr;
		}
	}

	.feature-item {
		display: flex;
		gap: var(--sp-sm);
		align-items: flex-start;
	}

	.feature-item .feature-icon {
		font-size: 1.3rem;
		flex-shrink: 0;
		line-height: 1.4;
	}

	.feature-item strong {
		font-family: var(--font);
		font-size: var(--fs-md);
		color: var(--c-text);
		display: block;
		margin-bottom: 2px;
	}

	.feature-item p {
		font-family: var(--font);
		font-size: var(--fs-sm);
		color: var(--c-text-soft);
		margin: 0;
		line-height: 1.4;
	}

	/* CTA */
	.cta {
		text-align: center;
		margin-bottom: 0;
	}

	.cta .primary {
		font-family: var(--font);
		font-size: var(--fs-lg);
		font-weight: 700;
		padding: var(--sp-sm) var(--sp-2xl);
		background: var(--c-accent-bg);
		color: var(--c-accent-text);
		border: 1.5px solid var(--c-accent-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--tr-fast);
	}

	.cta .primary:hover {
		background: var(--c-accent-bg-hover);
	}

	.cta-sub {
		font-family: var(--font);
		font-size: var(--fs-sm);
		color: var(--c-text-muted);
		margin-top: var(--sp-md);
	}

	.cta-sub a {
		color: var(--c-accent-text);
		text-decoration: none;
	}

	.cta-sub a:hover {
		text-decoration: underline;
	}

	.sep {
		margin: 0 var(--sp-xs);
	}
</style>
