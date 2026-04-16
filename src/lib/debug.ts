/** Lightweight debug mode — activated by ?debug in the URL or Ctrl+Shift+D. */

export let DEBUG = new URLSearchParams(window.location.search).has('debug')

let onToggle: ((active: boolean) => void) | null = null

/** Register a callback for when debug mode is toggled at runtime */
export function onDebugToggle(fn: ((active: boolean) => void) | null): void {
	onToggle = fn
}

/** Toggle debug mode on/off */
export function toggleDebug(): void {
	DEBUG = !DEBUG
	onToggle?.(DEBUG)
}

// Secret hotkey: Ctrl+Shift+D toggles debug mid-session
if (typeof window !== 'undefined') {
	window.addEventListener('keydown', (e) => {
		if (e.ctrlKey && e.shiftKey && e.key === 'D') {
			e.preventDefault()
			toggleDebug()
		}
	})
}

interface DebugEntry {
	time: number
	tag: string
	msg: string
	data?: unknown
}

const MAX_LOG = 200
const entries: DebugEntry[] = []
let onChange: (() => void) | null = null

export function debugLog(tag: string, msg: string, data?: unknown): void {
	const entry: DebugEntry = { time: Date.now(), tag, msg, data }
	entries.push(entry)
	if (entries.length > MAX_LOG) entries.shift()
	if (DEBUG) {
		console.log(`[estimate:${tag}]`, msg, data ?? '')
	}
	onChange?.()
}

export function getDebugEntries(): readonly DebugEntry[] {
	return entries
}

export function onDebugChange(fn: (() => void) | null): void {
	onChange = fn
}

export function formatTime(ts: number): string {
	const d = new Date(ts)
	return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
}
