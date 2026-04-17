import '@testing-library/jest-dom/vitest'

// jsdom doesn't provide pointer capture methods
if (!Element.prototype.setPointerCapture) {
	Element.prototype.setPointerCapture = () => {}
	Element.prototype.releasePointerCapture = () => {}
}

// jsdom doesn't provide ResizeObserver — stub it for component tests
if (typeof globalThis.ResizeObserver === 'undefined') {
	globalThis.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof globalThis.ResizeObserver
}

// jsdom doesn't provide Path2D — stub for canvas drawing code
if (typeof globalThis.Path2D === 'undefined') {
	globalThis.Path2D = class Path2D {
		moveTo() {}
		lineTo() {}
		quadraticCurveTo() {}
		bezierCurveTo() {}
		closePath() {}
		arc() {}
		rect() {}
		addPath() {}
	} as unknown as typeof globalThis.Path2D
}

// jsdom doesn't provide OffscreenCanvas — stub for canvas drawing code
if (typeof globalThis.OffscreenCanvas === 'undefined') {
	const noop = () => {}
	globalThis.OffscreenCanvas = class OffscreenCanvas {
		width: number
		height: number
		constructor(w: number, h: number) {
			this.width = w
			this.height = h
		}
		getContext() {
			return new Proxy(
				{},
				{
					get(_, prop) {
						if (prop === 'measureText') return () => ({ width: 0 })
						if (prop === 'createLinearGradient') return () => ({ addColorStop: noop })
						return noop
					},
					set() {
						return true
					},
				},
			)
		}
	} as unknown as typeof globalThis.OffscreenCanvas
}
