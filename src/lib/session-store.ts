import type { ImportedTicket } from './types'

export interface SavedSession {
	roomId: string
	userName: string
	topic: string
	unit: string
	isCreator: boolean
	peerNames: string[]
	lastUsed: number
}

const STORAGE_KEY = 'estimate-sessions'
const MAX_SESSIONS = 10

export function getSavedSessions(): SavedSession[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return []
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed
			.filter(
				(s): s is SavedSession =>
					typeof s === 'object' &&
					s !== null &&
					typeof s.roomId === 'string' &&
					typeof s.userName === 'string' &&
					typeof s.lastUsed === 'number',
			)
			.sort((a, b) => b.lastUsed - a.lastUsed)
	} catch {
		return []
	}
}

export function saveSession(session: SavedSession): void {
	const sessions = getSavedSessions().filter(
		(s) => !(s.roomId === session.roomId && s.userName === session.userName),
	)
	sessions.unshift(session)
	localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
}

export function deleteSession(roomId: string): void {
	const sessions = getSavedSessions().filter((s) => s.roomId !== roomId)
	localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function getLastUserName(): string {
	const sessions = getSavedSessions()
	return sessions.length > 0 ? sessions[0].userName : ''
}

// --- Persistent verdict history ---

export interface HistoryVerdict {
	label: string
	mu: number
	sigma: number
	unit: string
	timestamp: number
	roomId?: string
	ticketId?: string
}

const HISTORY_KEY = 'estimate-history'
const MAX_HISTORY = 50

export function getVerdictHistory(unit?: string, roomId?: string): HistoryVerdict[] {
	try {
		const raw = localStorage.getItem(HISTORY_KEY)
		if (!raw) return []
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		let all = parsed.filter(
			(v): v is HistoryVerdict =>
				typeof v === 'object' &&
				v !== null &&
				typeof v.label === 'string' &&
				typeof v.mu === 'number' &&
				typeof v.sigma === 'number' &&
				typeof v.unit === 'string' &&
				typeof v.timestamp === 'number',
		)
		if (roomId !== undefined) all = all.filter((v) => v.roomId === roomId)
		if (unit !== undefined) all = all.filter((v) => v.unit === unit)
		return all
	} catch {
		return []
	}
}

export function saveVerdict(entry: HistoryVerdict): void {
	const all = getVerdictHistory()
	// Replace existing entry with same ticket (or label fallback) + unit + roomId
	const idx = all.findIndex(
		(v) =>
			v.unit === entry.unit &&
			v.roomId === entry.roomId &&
			(entry.ticketId ? v.ticketId === entry.ticketId : v.label === entry.label),
	)
	if (idx >= 0) {
		all[idx] = entry
	} else {
		all.push(entry)
	}
	// Keep most recent entries
	const trimmed = all.slice(-MAX_HISTORY)
	localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
}

// --- Pre-estimate persistence ---

interface StoredEstimate {
	mu: number
	sigma: number
}

const PRE_ESTIMATE_KEY = 'estimate-pre-estimates'

/**
 * Save a pre-estimate for a ticket in a room.
 * Stored as { [roomId]: { [ticketId]: { mu, sigma } } }.
 */
export function savePreEstimate(roomId: string, ticketId: string, mu: number, sigma: number): void {
	try {
		const raw = localStorage.getItem(PRE_ESTIMATE_KEY)
		const all: Record<string, Record<string, StoredEstimate>> = raw ? JSON.parse(raw) : {}
		if (!all[roomId]) all[roomId] = {}
		all[roomId][ticketId] = { mu, sigma }
		localStorage.setItem(PRE_ESTIMATE_KEY, JSON.stringify(all))
	} catch {
		// Ignore storage errors
	}
}

/**
 * Get all pre-estimates for a room as a Map.
 */
export function getPreEstimates(roomId: string): Map<string, StoredEstimate> {
	try {
		const raw = localStorage.getItem(PRE_ESTIMATE_KEY)
		if (!raw) return new Map()
		const all: unknown = JSON.parse(raw)
		if (typeof all !== 'object' || all === null) return new Map()
		const room = (all as Record<string, unknown>)[roomId]
		if (typeof room !== 'object' || room === null) return new Map()
		const result = new Map<string, StoredEstimate>()
		for (const [ticketId, est] of Object.entries(room as Record<string, unknown>)) {
			if (
				typeof est === 'object' &&
				est !== null &&
				typeof (est as StoredEstimate).mu === 'number' &&
				typeof (est as StoredEstimate).sigma === 'number'
			) {
				result.set(ticketId, est as StoredEstimate)
			}
		}
		return result
	} catch {
		return new Map()
	}
}

// --- Backlog persistence ---

const BACKLOG_KEY = 'estimate-backlogs'

/**
 * Persist the backlog for a room so it survives page reloads.
 */
export function saveBacklog(roomId: string, tickets: ImportedTicket[]): void {
	try {
		const raw = localStorage.getItem(BACKLOG_KEY)
		const all: Record<string, ImportedTicket[]> = raw ? JSON.parse(raw) : {}
		all[roomId] = tickets
		localStorage.setItem(BACKLOG_KEY, JSON.stringify(all))
	} catch {
		// Ignore storage errors
	}
}

/**
 * Load a persisted backlog for a room.
 */
export function getBacklog(roomId: string): ImportedTicket[] {
	try {
		const raw = localStorage.getItem(BACKLOG_KEY)
		if (!raw) return []
		const all: unknown = JSON.parse(raw)
		if (typeof all !== 'object' || all === null) return []
		const tickets = (all as Record<string, unknown>)[roomId]
		if (!Array.isArray(tickets)) return []
		return tickets.filter(
			(t): t is ImportedTicket =>
				typeof t === 'object' &&
				t !== null &&
				typeof (t as ImportedTicket).id === 'string' &&
				typeof (t as ImportedTicket).title === 'string',
		)
	} catch {
		return []
	}
}
