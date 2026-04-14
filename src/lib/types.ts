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
	isCreator?: boolean
}

export type TopicMessage = {
	topic: string
	url?: string
	ticketId?: string
}

export type ReadyMessage = {
	ready: boolean
}

export type UnitMessage = {
	unit: string
}

export type ImportedTicket = {
	id: string
	title: string
	url?: string
	labels?: string[]
	assignee?: string
	description?: string
}

export interface EstimatedTicket extends ImportedTicket {
	median?: number
	p10?: number
	p90?: number
	estimateUnit?: string
}

export type BacklogMessage = {
	tickets: ImportedTicket[]
	prepMode?: boolean
}

export interface HistoryEntry {
	label: string
	mu: number
	sigma: number
}

export interface SceneState {
	myEstimate: Estimate
	peerEstimates: Array<Estimate & { color: string }>
	revealed: boolean
	history: HistoryEntry[]
	unit: string
	currentTicket?: ImportedTicket
	persistentHistory: HistoryEntry[]
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
