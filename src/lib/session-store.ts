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
