/**
 * Samen roster store — localStorage caching for rosters and identity.
 * Pure functions with no Svelte dependencies, reusable across tools.
 */

import type { SamenIdentity, TeamSpace } from './types'

// --- Roster cache (localStorage per-room) ---

function rosterCacheKey(roomCode: string): string {
	return `samen-roster-${roomCode.slice(0, 16)}`
}

export function loadCachedRoster(roomCode: string): TeamSpace | null {
	try {
		const raw = localStorage.getItem(rosterCacheKey(roomCode))
		if (!raw) return null
		const data = JSON.parse(raw) as TeamSpace
		// Backfill rooms array for caches written before room index existed
		if (!data.rooms) data.rooms = []
		return data
	} catch {
		return null
	}
}

export function saveCachedRoster(roster: TeamSpace): void {
	localStorage.setItem(rosterCacheKey(roster.roomCode), JSON.stringify(roster))
}

export function clearCachedRoster(roomCode: string): void {
	localStorage.removeItem(rosterCacheKey(roomCode))
}

// --- Identity cache (cross-session, cross-tool) ---

const IDENTITY_KEY = 'samen-identity'

export function loadIdentity(): SamenIdentity | null {
	try {
		const raw = localStorage.getItem(IDENTITY_KEY)
		return raw ? JSON.parse(raw) : null
	} catch {
		return null
	}
}

export function saveIdentity(identity: SamenIdentity): void {
	localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
}
