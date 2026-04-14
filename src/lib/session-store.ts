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
	const sessions = getSavedSessions().filter((s) => s.roomId !== session.roomId)
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
}

const HISTORY_KEY = 'estimate-history'
const MAX_HISTORY = 50

export function getVerdictHistory(unit?: string): HistoryVerdict[] {
	try {
		const raw = localStorage.getItem(HISTORY_KEY)
		if (!raw) return []
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		const all = parsed.filter(
			(v): v is HistoryVerdict =>
				typeof v === 'object' &&
				v !== null &&
				typeof v.label === 'string' &&
				typeof v.mu === 'number' &&
				typeof v.sigma === 'number' &&
				typeof v.unit === 'string' &&
				typeof v.timestamp === 'number',
		)
		if (unit === undefined) return all
		return all.filter((v) => v.unit === unit)
	} catch {
		return []
	}
}

export function saveVerdict(entry: HistoryVerdict): void {
	const all = getVerdictHistory()
	// Replace existing entry with same label+unit, or append
	const idx = all.findIndex((v) => v.label === entry.label && v.unit === entry.unit)
	if (idx >= 0) {
		all[idx] = entry
	} else {
		all.push(entry)
	}
	// Keep most recent entries
	const trimmed = all.slice(-MAX_HISTORY)
	localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
}
