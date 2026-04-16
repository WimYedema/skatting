/** Lightweight debug mode — activated by ?debug in the URL. */

export const DEBUG = new URLSearchParams(window.location.search).has('debug')

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
	if (!DEBUG) return
	const entry: DebugEntry = { time: Date.now(), tag, msg, data }
	entries.push(entry)
	if (entries.length > MAX_LOG) entries.shift()
	console.log(`[estimate:${tag}]`, msg, data ?? '')
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
