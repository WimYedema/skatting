export interface Estimate {
	mu: number
	sigma: number
}

export interface PeerEstimate extends Estimate {
	peerId: string
	revealed: boolean
}

export interface SessionState {
	sessionName: string
	revealed: boolean
}
