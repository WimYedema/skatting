import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import SessionLobby from './SessionLobby.svelte'

// Mock session-store module — called at import time by the component
vi.mock('../lib/session-store', () => ({
	getLastUserName: () => 'Alice',
	getSavedSessions: () => [] as unknown[],
	deleteSession: vi.fn(),
}))

// Mock config module
vi.mock('../lib/config', () => ({
	generateRoomId: () => 'testroom',
	MAX_PEERS: 15,
	NOSTR_RELAY_URLS: [],
}))

describe('SessionLobby', () => {
	let onJoin: ReturnType<typeof vi.fn>

	beforeEach(() => {
		onJoin = vi.fn()
	})

	afterEach(() => {
		cleanup()
		// Clear any URL params set by handleCreate (prevents test pollution)
		window.history.replaceState({}, '', window.location.pathname)
	})

	it('shows create and join buttons in choose mode', () => {
		render(SessionLobby, { props: { onJoin } })
		expect(screen.getByText('+ New Session')).toBeInTheDocument()
		expect(screen.getByText('Join by Code')).toBeInTheDocument()
	})

	it('clicking New Session switches to create mode with name input', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('+ New Session'))
		// Create mode shows room code, name input, and Start button
		expect(screen.getByText('testroom')).toBeInTheDocument()
		expect(screen.getByLabelText('Your name')).toBeInTheDocument()
		expect(screen.getByText('Start')).toBeInTheDocument()
	})

	it('clicking Start calls onJoin with room, name, and unit', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('+ New Session'))
		await fireEvent.click(screen.getByText('Start'))
		expect(onJoin).toHaveBeenCalledWith('testroom', 'Alice', 'points')
	})

	it('clicking Join by Code switches to join mode', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('Join by Code'))
		expect(screen.getByText('Join directly')).toBeInTheDocument()
		expect(screen.getByPlaceholderText('e.g. bakitume')).toBeInTheDocument()
	})

	it('Join button is disabled without room code', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('Join by Code'))
		expect(screen.getByText('Join directly')).toBeDisabled()
	})

	it('typing room code and clicking Join calls onJoin', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('Join by Code'))
		const input = screen.getByPlaceholderText('e.g. bakitume')
		await fireEvent.input(input, { target: { value: 'myroom' } })
		await fireEvent.click(screen.getByText('Join directly'))
		expect(onJoin).toHaveBeenCalledWith('myroom', 'Alice', null)
	})

	it('Back button returns to choose mode', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('+ New Session'))
		await fireEvent.click(screen.getByText('← Back'))
		expect(screen.getByText('+ New Session')).toBeInTheDocument()
	})

	it('unit picker defaults to points', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('+ New Session'))
		const select = screen.getByLabelText('Unit:') as HTMLSelectElement
		expect(select.value).toBe('points')
	})

	it('can change unit to days', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('+ New Session'))
		const select = screen.getByLabelText('Unit:') as HTMLSelectElement
		await fireEvent.change(select, { target: { value: 'days' } })
		await fireEvent.click(screen.getByText('Start'))
		expect(onJoin).toHaveBeenCalledWith('testroom', 'Alice', 'days')
	})

	it('shows Look up session button when query props provided and code is long enough', async () => {
		const queryRoomState = vi.fn().mockResolvedValue(null)
		const queryPrepDone = vi.fn().mockResolvedValue([])
		render(SessionLobby, { props: { onJoin, queryRoomState, queryPrepDone } })
		await fireEvent.click(screen.getByText('Join by Code'))
		const input = screen.getByPlaceholderText('e.g. bakitume')
		await fireEvent.input(input, { target: { value: 'abcd' } })
		expect(screen.getByText('Look up session')).toBeInTheDocument()
	})

	it('Look up session queries Nostr and shows preview', async () => {
		const queryRoomState = vi.fn().mockResolvedValue({
			backlog: [{ id: '1', title: 'T1' }, { id: '2', title: 'T2' }],
			unit: 'points',
			prepMode: true,
			topic: 'Sprint 42',
		})
		const queryPrepDone = vi.fn().mockResolvedValue([
			{ name: 'Bob', ticketCount: 2, timestamp: 1000 },
		])
		render(SessionLobby, { props: { onJoin, queryRoomState, queryPrepDone } })
		await fireEvent.click(screen.getByText('Join by Code'))
		const input = screen.getByPlaceholderText('e.g. bakitume')
		await fireEvent.input(input, { target: { value: 'testcode' } })
		await fireEvent.click(screen.getByText('Look up session'))
		// Wait for async
		await vi.waitFor(() => {
			expect(screen.getByText('Sprint 42')).toBeInTheDocument()
		})
		expect(screen.getByText(/2 tickets/)).toBeInTheDocument()
		expect(screen.getByText('Bob')).toBeInTheDocument()
	})

	it('clicking a name pill sets the user name', async () => {
		const queryRoomState = vi.fn().mockResolvedValue({
			backlog: [],
			unit: 'days',
			prepMode: false,
			topic: 'Test',
		})
		const queryPrepDone = vi.fn().mockResolvedValue([
			{ name: 'Carol', ticketCount: 5, timestamp: 2000 },
		])
		render(SessionLobby, { props: { onJoin, queryRoomState, queryPrepDone } })
		await fireEvent.click(screen.getByText('Join by Code'))
		const codeInput = screen.getByPlaceholderText('e.g. bakitume')
		await fireEvent.input(codeInput, { target: { value: 'testcode' } })
		await fireEvent.click(screen.getByText('Look up session'))
		await vi.waitFor(() => {
			expect(screen.getByText('Carol')).toBeInTheDocument()
		})
		await fireEvent.click(screen.getByText('Carol'))
		// Name input should now have Carol
		const nameInput = screen.getByPlaceholderText('or type a new name') as HTMLInputElement
		expect(nameInput.value).toBe('Carol')
	})
})
