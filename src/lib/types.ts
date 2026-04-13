export interface Estimate {
	mu: number
	sigma: number
}

export interface PeerEstimate extends Estimate {
	peerId: string
}

// Use `type` (not `interface`) for Trystero payloads — they need index signature compatibility
export type EstimateMessage = {
	mu: number
	sigma: number
}

export type RevealMessage = {
	revealed: boolean
}

export type NameMessage = {
	name: string
}

export type TopicMessage = {
	topic: string
}

export type ReadyMessage = {
	ready: boolean
}

/** Distinct colors assigned to peers for overlay rendering */
export const PEER_COLORS = [
	'#ef4444', // red
	'#f97316', // orange
	'#eab308', // yellow
	'#22c55e', // green
	'#06b6d4', // cyan
	'#8b5cf6', // violet
	'#ec4899', // pink
	'#14b8a6', // teal
	'#f59e0b', // amber
	'#6366f1', // indigo
]
