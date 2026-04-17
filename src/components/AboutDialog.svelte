<script lang="ts">
	declare const __BUILD_HASH__: string

	interface Props {
		onClose: () => void
	}

	let { onClose }: Props = $props()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onClose}>
	<div class="about-card" onclick={(e) => e.stopPropagation()}>
		<button class="close" onclick={onClose}>×</button>

		<svg class="about-header" viewBox="0 0 440 80" aria-hidden="true">
			<defs>
				<pattern id="hatch-about" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
					<line x1="0" y1="0" x2="0" y2="3" stroke="#5a5040" stroke-width="0.7"/>
				</pattern>
			</defs>
			<!-- Ruled lines -->
			<line x1="0" y1="22" x2="440" y2="22" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
			<line x1="0" y1="44" x2="440" y2="44" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
			<line x1="0" y1="66" x2="440" y2="66" stroke="rgba(140,180,210,0.3)" stroke-width="0.5"/>
			<!-- Red margin -->
			<line x1="24" y1="0" x2="24" y2="80" stroke="rgba(200,120,120,0.3)" stroke-width="0.8"/>
			<!-- Title -->
			<text x="220" y="52" text-anchor="middle" font-family="Caveat, cursive" font-size="38" font-weight="700"
				fill="url(#hatch-about)" stroke="#5a5040" stroke-width="0.4" letter-spacing="1">Skatting</text>
		</svg>

		<p class="tagline">estimate with uncertainty</p>

		<div class="description">
			<p>
				A peer-to-peer estimation tool for agile teams. Instead of picking a card,
				you place a <strong>blob</strong> on a 2D plane — position sets the estimate,
				height sets your certainty.
			</p>
			<p>
				The blob follows a <em>log-normal distribution</em>, reflecting how software
				estimates actually behave: bounded at zero, right-skewed, with a long tail
				for overruns.
			</p>
		</div>

		<div class="features">
			<div class="feature">
				<span class="feature-icon">🔒</span>
				<span>Fully serverless — peers connect directly via WebRTC</span>
			</div>
			<div class="feature">
				<span class="feature-icon">📊</span>
				<span>Two dimensions: effort × certainty in one gesture</span>
			</div>
			<div class="feature">
				<span class="feature-icon">🎲</span>
				<span>Log-normal math for realistic uncertainty</span>
			</div>
		</div>

		<div class="links">
			<a href="https://github.com/WimYedema/skatting" target="_blank" rel="noopener">
				GitHub
			</a>
			<span class="separator">·</span>
			<a href="https://github.com/WimYedema/skatting/issues" target="_blank" rel="noopener">
				Report a bug
			</a>
			<span class="separator">·</span>
			<a href="https://github.com/WimYedema/skatting/blob/master/LICENSE" target="_blank" rel="noopener">
				MIT License
			</a>
		</div>

		<div class="build">
			build <a href="https://github.com/WimYedema/skatting/commit/{__BUILD_HASH__}" target="_blank" rel="noopener">{__BUILD_HASH__}</a>
		</div>
	</div>
</div>

<style>
	.about-card {
		position: relative;
		background: var(--c-surface);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.12));
		max-width: 460px;
		width: 90vw;
		padding: var(--sp-xl) var(--sp-2xl) var(--sp-lg);
		text-align: center;
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
	}

	.close:hover {
		color: var(--c-text);
	}

	.about-header {
		width: 100%;
		max-width: 440px;
		margin: 0 auto;
	}

	.tagline {
		font-family: var(--font);
		font-size: var(--fs-lg);
		color: var(--c-text-muted);
		margin: 0 0 var(--sp-lg);
	}

	.description {
		text-align: left;
		font-family: var(--font);
		font-size: var(--fs-md);
		color: var(--c-text-soft);
		line-height: 1.5;
		margin-bottom: var(--sp-lg);
	}

	.description p {
		margin: 0 0 var(--sp-sm);
	}

	.description strong {
		color: var(--c-text);
	}

	.description em {
		font-style: normal;
		color: var(--c-accent-text);
	}

	.features {
		display: flex;
		flex-direction: column;
		gap: var(--sp-sm);
		margin-bottom: var(--sp-xl);
		text-align: left;
	}

	.feature {
		display: flex;
		align-items: baseline;
		gap: var(--sp-sm);
		font-family: var(--font);
		font-size: var(--fs-md);
		color: var(--c-text-soft);
	}

	.feature-icon {
		flex-shrink: 0;
	}

	.links {
		font-family: var(--font);
		font-size: var(--fs-md);
		margin-bottom: var(--sp-md);
	}

	.links a {
		color: var(--c-accent-text);
		text-decoration: none;
	}

	.links a:hover {
		text-decoration: underline;
	}

	.separator {
		color: var(--c-text-muted);
		margin: 0 var(--sp-xs);
	}

	.build {
		font-family: var(--font-mono, monospace);
		font-size: var(--fs-xs);
		color: var(--c-text-muted);
		opacity: 0.6;
	}

	.build a {
		color: inherit;
		text-decoration: none;
	}

	.build a:hover {
		text-decoration: underline;
	}
</style>
