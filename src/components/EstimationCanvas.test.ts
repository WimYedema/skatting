import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
import { describe, expect, it, vi, afterEach } from 'vitest'
import EstimationCanvas from './EstimationCanvas.svelte'

// jsdom doesn't implement Canvas 2D — return a proxy that stubs all methods
const noop = vi.fn()
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(
	new Proxy(
		{
			canvas: { width: 800, height: 500 },
			measureText: vi.fn().mockReturnValue({ width: 50 }),
			createPattern: vi.fn(),
			createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
		},
		{
			get(target, prop) {
				if (prop in target) return (target as Record<string | symbol, unknown>)[prop]
				return noop
			},
			set() {
				return true
			},
		},
	),
) as unknown as typeof HTMLCanvasElement.prototype.getContext

function defaultProps() {
	return {
		mu: 1.5,
		sigma: 0.4,
		peerEstimates: [] as Array<{ mu: number; sigma: number; color: string; name: string }>,
		revealed: false,
		userName: 'Alice',
		history: [],
		persistentHistory: [],
		unit: 'points',
		onEstimateChange: vi.fn(),
	}
}

describe('EstimationCanvas', () => {
	afterEach(() => {
		cleanup()
	})

	it('renders canvas element', () => {
		const props = defaultProps()
		render(EstimationCanvas, { props })
		const canvas = document.querySelector('canvas')
		expect(canvas).toBeInTheDocument()
	})

	it('shows crosshair cursor by default', () => {
		const props = defaultProps()
		render(EstimationCanvas, { props })
		const canvas = document.querySelector('canvas')!
		expect(canvas.style.cursor).toBe('crosshair')
	})

	it('does not show abstain button by default', () => {
		const props = defaultProps()
		render(EstimationCanvas, { props })
		expect(screen.queryByText('No idea 🤷')).not.toBeInTheDocument()
	})

	it('shows abstain button when showAbstainButton is true', () => {
		const props = { ...defaultProps(), showAbstainButton: true }
		render(EstimationCanvas, { props })
		expect(screen.getByText('No idea 🤷')).toBeInTheDocument()
	})

	it('hides abstain button when already abstained', () => {
		const props = { ...defaultProps(), showAbstainButton: true, selfAbstained: true }
		render(EstimationCanvas, { props })
		expect(screen.queryByText('No idea 🤷')).not.toBeInTheDocument()
	})

	it('clicking abstain button calls onAbstain', async () => {
		const onAbstain = vi.fn()
		const props = { ...defaultProps(), showAbstainButton: true, onAbstain }
		render(EstimationCanvas, { props })
		await fireEvent.click(screen.getByText('No idea 🤷'))
		expect(onAbstain).toHaveBeenCalled()
	})

	it('pointerdown on canvas calls onEstimateChange', async () => {
		const props = defaultProps()
		render(EstimationCanvas, { props })
		const canvas = document.querySelector('canvas')!
		// Simulate pointerdown at center of canvas
		await fireEvent.pointerDown(canvas, {
			clientX: 400,
			clientY: 250,
			pointerId: 1,
		})
		expect(props.onEstimateChange).toHaveBeenCalled()
	})

	it('onEstimateChange receives numeric mu and sigma', async () => {
		const props = defaultProps()
		render(EstimationCanvas, { props })
		const canvas = document.querySelector('canvas')!
		// Mock getBoundingClientRect for consistent math
		canvas.getBoundingClientRect = vi.fn().mockReturnValue({
			left: 0,
			top: 0,
			width: 800,
			height: 500,
			right: 800,
			bottom: 500,
		})
		await fireEvent.pointerDown(canvas, {
			clientX: 400,
			clientY: 250,
			pointerId: 1,
		})
		const [mu, sigma] = props.onEstimateChange.mock.calls[0]
		expect(typeof mu).toBe('number')
		expect(typeof sigma).toBe('number')
		expect(mu).toBeGreaterThan(0)
		expect(sigma).toBeGreaterThan(0)
	})

	it('shows default cursor and ignores pointerdown when revealed', async () => {
		const props = { ...defaultProps(), revealed: true }
		render(EstimationCanvas, { props })
		const canvas = document.querySelector('canvas')!
		expect(canvas.style.cursor).toBe('default')
		await fireEvent.pointerDown(canvas, {
			clientX: 400,
			clientY: 250,
			pointerId: 1,
		})
		expect(props.onEstimateChange).not.toHaveBeenCalled()
	})
})
