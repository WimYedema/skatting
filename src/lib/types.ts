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

export type UnitMessage = {
	unit: string
}

/** Muted colors assigned to peers — like colored pencils on paper */
export const PEER_COLORS = [
	'#b56b6b', // dusty rose
	'#c4885a', // warm ochre
	'#8a9a5a', // sage green
	'#6a94a0', // muted teal
	'#8b7baa', // slate purple
	'#c47a8a', // faded pink
	'#7a9a6a', // olive
	'#a08a5a', // tan
	'#7a8aaa', // steel blue
	'#9a7a6a', // warm grey
]
