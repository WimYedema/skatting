import { getCurrentTicket, getEstimatedCount, persistSession, publishState, type SessionDeps, type SessionState } from './session-state'
import { buildRevealPayload, resetReadyState, resetRound, saveRoundToHistory } from './session-round'
import type { ImportedTicket } from './types'

// ---------------------------------------------------------------------------
// Topic management
// ---------------------------------------------------------------------------

export function handleTopicChange(s: SessionState, deps: SessionDeps): void {
	const trimmed = s.topic.trim()
	if (/^https?:\/\//.test(trimmed) && !s.topicUrl) {
		s.topicUrl = trimmed
	}
	const currentTicket = getCurrentTicket(s)
	s.session?.sendTopic({
		topic: trimmed,
		url: s.topicUrl || undefined,
		ticketId: currentTicket?.id,
	})
	persistSession(s, deps)
}

// ---------------------------------------------------------------------------
// Ticket navigation
// ---------------------------------------------------------------------------

interface SelectTicketOptions {
	/** Skip saving current estimate to history (caller already handled it) */
	skipSave?: boolean
	/** Skip sending topic to peers (caller will send, or this is from an incoming P2P message) */
	skipSend?: boolean
}

export function selectTicket(s: SessionState, index: number, opts: SelectTicketOptions = {}): void {
	if (index < 0 || index >= s.backlog.length) return

	const currentTicket = getCurrentTicket(s)
	if (!opts.skipSave && currentTicket && s.hasMoved && !s.selfAbstained) {
		s.myEstimates = new Map(s.myEstimates).set(currentTicket.id, { mu: s.mu, sigma: s.sigma })
		if (s.storage) s.storage.savePreEstimate(currentTicket.id, s.mu, s.sigma)
		// Only save to history when a round was actually revealed in meeting mode
		if (!s.prepMode && s.revealed) {
			buildRevealPayload(s)
			saveRoundToHistory(s)
		}
	}

	resetReadyState(s)

	s.backlogIndex = index
	const ticket = s.backlog[index]

	// Restore abstain state for this ticket
	if (s.abstainedTickets.has(ticket.id)) {
		s.selfAbstained = true
		s.mu = 2.0
		s.sigma = 0.6
		s.hasMoved = false
	} else {
		const saved = s.myEstimates.get(ticket.id)
		if (saved) {
			s.mu = saved.mu
			s.sigma = saved.sigma
			s.hasMoved = true
		} else if (s.storage) {
			const stored = s.storage.getPreEstimates()
			const pre = stored.get(ticket.id)
			if (pre) {
				s.mu = pre.mu
				s.sigma = pre.sigma
			s.myEstimates = new Map(s.myEstimates).set(ticket.id, pre)
				s.hasMoved = true
			} else {
				s.mu = 2.0
				s.sigma = 0.6
				s.hasMoved = false
			}
		} else {
			s.mu = 2.0
			s.sigma = 0.6
			s.hasMoved = false
		}
	}

	if (!s.prepMode && !opts.skipSend) {
		s.session?.sendTopic({
			topic: '',
			url: ticket.url,
			ticketId: ticket.id,
		})
	}

	// In meeting mode, broadcast restored estimate so peers see the new position
	if (!s.prepMode && s.hasMoved && !s.selfAbstained) {
		s.session?.sendEstimate({ mu: s.mu, sigma: s.sigma })
	}
}

// ---------------------------------------------------------------------------
// Next / advance
// ---------------------------------------------------------------------------

export function handleNext(
	s: SessionState,
	deps: SessionDeps,
	verdictOverride: number | null = null,
): void {
	if (!s.prepMode && !s.revealed) return
	const currentTicket = getCurrentTicket(s)
	if (currentTicket && s.hasMoved && !s.selfAbstained) {
		s.myEstimates = new Map(s.myEstimates).set(currentTicket.id, { mu: s.mu, sigma: s.sigma })
		if (s.storage) s.storage.savePreEstimate(currentTicket.id, s.mu, s.sigma)
	}
	// Auto-abstain: if user never dragged and didn't explicitly estimate, treat as skip
	if (currentTicket && !s.hasMoved && !s.selfAbstained) {
		s.selfAbstained = true
		s.abstainedTickets.add(currentTicket.id)
	}

	if (!s.prepMode) {
		// Build authoritative verdict payload before saveRoundToHistory consumes state
		const revealPayload = buildRevealPayload(s, { revealed: false })
		// Apply verdictOverride to the outgoing payload if the facilitator positioned a call
		if (verdictOverride != null && revealPayload.verdict) {
			revealPayload.verdict = { ...revealPayload.verdict, median: verdictOverride }
		}

		saveRoundToHistory(s, verdictOverride)
		resetRound(s)
		s.session?.sendReveal(revealPayload)
	} else {
		resetRound(s)
	}

	if (s.backlog.length > 0 && s.backlogIndex < s.backlog.length - 1) {
		selectTicket(s, s.backlogIndex + 1, { skipSave: true })
	} else if (s.backlog.length > 0) {
		s.showSummary = true
		// Signal prep completion to Nostr if in prep mode
		if (s.prepMode && s.roomCode && s.secretKeyHex) {
			deps
				.publishPrepDone(s.roomCode, s.secretKeyHex, {
					name: s.userName,
					ticketCount: getEstimatedCount(s),
					timestamp: Date.now(),
				})
				.catch(() => {})
		}
	}
}

// ---------------------------------------------------------------------------
// Backlog import / management
// ---------------------------------------------------------------------------

export function processBacklogImport(
	s: SessionState,
	deps: SessionDeps,
	tickets: ImportedTicket[],
): void {
	if (tickets.length === 0) return
	s.backlog = tickets.map((t) => ({ ...t }))
	s.backlogIndex = -1
	s.prepMode = true
	if (s.storage) s.storage.saveBacklog(tickets)
	s.session?.sendBacklog({ tickets, prepMode: true })
	selectTicket(s, 0)
	publishState(s, deps)
}

export function mergeBacklogImport(
	s: SessionState,
	deps: SessionDeps,
	tickets: ImportedTicket[],
): void {
	if (tickets.length === 0) return
	const existingIds = new Set(s.backlog.map((t) => t.id))
	const newTickets = tickets.filter((t) => !existingIds.has(t.id))
	if (newTickets.length === 0) return
	s.backlog = [...s.backlog, ...newTickets.map((t) => ({ ...t }))]
	// Pre-populate myEstimates from storage for merged tickets
	if (s.storage) {
		const stored = s.storage.getPreEstimates()
		let merged = s.myEstimates
		for (const t of newTickets) {
			const pre = stored.get(t.id)
			if (pre) merged = new Map(merged).set(t.id, pre)
		}
		if (merged !== s.myEstimates) s.myEstimates = merged
		s.storage.saveBacklog(s.backlog)
	}
	s.session?.sendBacklog({ tickets: s.backlog, prepMode: s.prepMode })
	publishState(s, deps)
}

export function handleReorder(
	s: SessionState,
	deps: SessionDeps,
	fromIndex: number,
	toIndex: number,
): void {
	const item = s.backlog[fromIndex]
	s.backlog.splice(fromIndex, 1)
	s.backlog.splice(toIndex, 0, item)
	if (s.backlogIndex === fromIndex) {
		s.backlogIndex = toIndex
	} else if (fromIndex < s.backlogIndex && toIndex >= s.backlogIndex) {
		s.backlogIndex--
	} else if (fromIndex > s.backlogIndex && toIndex <= s.backlogIndex) {
		s.backlogIndex++
	}
	if (s.session) {
		s.session.sendBacklog({ tickets: s.backlog, prepMode: s.prepMode })
		if (s.storage) s.storage.saveBacklog(s.backlog)
	}
	publishState(s, deps)
}

export function handleRemove(s: SessionState, deps: SessionDeps, index: number): void {
	if (index < 0 || index >= s.backlog.length) return
	s.backlog.splice(index, 1)
	if (s.backlog.length === 0) {
		s.backlogIndex = -1
		s.topic = ''
		s.topicUrl = ''
	} else if (index < s.backlogIndex) {
		s.backlogIndex--
	} else if (index === s.backlogIndex) {
		const newIndex = Math.min(s.backlogIndex, s.backlog.length - 1)
		selectTicket(s, newIndex)
	}
	if (s.session) {
		s.session.sendBacklog({ tickets: s.backlog, prepMode: s.prepMode })
		if (s.storage) s.storage.saveBacklog(s.backlog)
	}
	publishState(s, deps)
}

// ---------------------------------------------------------------------------
// Meeting mode transitions
// ---------------------------------------------------------------------------

export function startMeeting(s: SessionState, deps: SessionDeps): void {
	s.prepMode = false
	const currentTicket = getCurrentTicket(s)
	s.session?.sendBacklog({ tickets: s.backlog, prepMode: false })
	s.session?.sendEstimate({ mu: s.mu, sigma: s.sigma })
	if (currentTicket) {
		s.session?.sendTopic({ topic: '', url: currentTicket.url, ticketId: currentTicket.id })
	}
	publishState(s, deps)
}

export function returnToPrep(s: SessionState): void {
	if (!s.isCreator) return
	s.prepMode = true
	resetRound(s)
	s.session?.sendBacklog({ tickets: s.backlog, prepMode: true })
}
