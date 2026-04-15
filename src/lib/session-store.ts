import type { ImportedTicket } from './types'

export interface SavedSession {
	roomId: string
	userName: string
	topic: string
	unit: string
	isCreator: boolean
	peerNames: string[]
	lastUsed: number
	/** Hex-encoded Nostr secret key (creator only) */
	secretKey?: string
	/** Hex-encoded Nostr public key */
	publicKey?: string
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

// --- Scoped storage (isolates per room+user) ---

interface StoredEstimate {
	mu: number
	sigma: number
}

const MAX_HISTORY = 50

/**
 * User-scoped localStorage abstraction.
 * All data is keyed by roomId + userName so different users
 * sharing the same browser never see each other's data.
 */
export interface ScopedStorage {
	savePreEstimate(ticketId: string, mu: number, sigma: number): void
	getPreEstimates(): Map<string, StoredEstimate>
	saveVerdict(entry: HistoryVerdict): void
	getVerdictHistory(unit?: string): HistoryVerdict[]
	saveBacklog(tickets: ImportedTicket[]): void
	getBacklog(): ImportedTicket[]
}

export function createScopedStorage(roomId: string, userName: string): ScopedStorage {
	const preEstKey = `estimate-pre:${roomId}:${userName}`
	const backlogKey = `estimate-backlog:${roomId}:${userName}`
	const historyKey = `estimate-history:${roomId}:${userName}`

	return {
		savePreEstimate(ticketId: string, mu: number, sigma: number): void {
			try {
				const raw = localStorage.getItem(preEstKey)
				const all: Record<string, StoredEstimate> = raw ? JSON.parse(raw) : {}
				all[ticketId] = { mu, sigma }
				localStorage.setItem(preEstKey, JSON.stringify(all))
			} catch {
				// Ignore storage errors
			}
		},

		getPreEstimates(): Map<string, StoredEstimate> {
			try {
				const raw = localStorage.getItem(preEstKey)
				if (!raw) return new Map()
				const obj: unknown = JSON.parse(raw)
				if (typeof obj !== 'object' || obj === null) return new Map()
				const result = new Map<string, StoredEstimate>()
				for (const [ticketId, est] of Object.entries(obj as Record<string, unknown>)) {
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
		},

		saveVerdict(entry: HistoryVerdict): void {
			const all = this.getVerdictHistory()
			const idx = all.findIndex(
				(v) =>
					v.unit === entry.unit &&
					(entry.ticketId ? v.ticketId === entry.ticketId : v.label === entry.label),
			)
			if (idx >= 0) {
				all[idx] = entry
			} else {
				all.push(entry)
			}
			const trimmed = all.slice(-MAX_HISTORY)
			localStorage.setItem(historyKey, JSON.stringify(trimmed))
		},

		getVerdictHistory(unit?: string): HistoryVerdict[] {
			try {
				const raw = localStorage.getItem(historyKey)
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
				if (unit !== undefined) all = all.filter((v) => v.unit === unit)
				return all
			} catch {
				return []
			}
		},

		saveBacklog(tickets: ImportedTicket[]): void {
			try {
				// Strip runtime-only fields (median, p10, p90, estimateUnit) to avoid
				// leaking one user's verdicts into another user's backlog view.
				const clean = tickets.map(({ id, title, url }) => {
					const t: ImportedTicket = { id, title }
					if (url) t.url = url
					return t
				})
				localStorage.setItem(backlogKey, JSON.stringify(clean))
			} catch {
				// Ignore storage errors
			}
		},

		getBacklog(): ImportedTicket[] {
			try {
				const raw = localStorage.getItem(backlogKey)
				if (!raw) return []
				const parsed: unknown = JSON.parse(raw)
				if (!Array.isArray(parsed)) return []
				return parsed.filter(
					(t): t is ImportedTicket =>
						typeof t === 'object' &&
						t !== null &&
						typeof (t as ImportedTicket).id === 'string' &&
						typeof (t as ImportedTicket).title === 'string',
				)
			} catch {
				return []
			}
		},
	}
}
