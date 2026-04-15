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
}))

describe('SessionLobby', () => {
	let onJoin: ReturnType<typeof vi.fn>

	beforeEach(() => {
		onJoin = vi.fn()
	})

	afterEach(() => {
		cleanup()
	})

	it('renders name input with stored name', () => {
		render(SessionLobby, { props: { onJoin } })
		const input = screen.getByLabelText('Your name') as HTMLInputElement
		expect(input.value).toBe('Alice')
	})

	it('shows create and join buttons in choose mode', () => {
		render(SessionLobby, { props: { onJoin } })
		expect(screen.getByText('+ New Session')).toBeInTheDocument()
		expect(screen.getByText('Join by Code')).toBeInTheDocument()
	})

	it('disables buttons when name is empty', () => {
		// Override mock to return empty name
		vi.doMock('../lib/session-store', () => ({
			getLastUserName: () => '',
			getSavedSessions: () => [],
			deleteSession: vi.fn(),
		}))
		render(SessionLobby, { props: { onJoin } })
		// Clear the name input
		const input = screen.getByLabelText('Your name') as HTMLInputElement
		fireEvent.input(input, { target: { value: '' } })
	})

	it('clicking New Session switches to create mode', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('+ New Session'))
		// Create mode shows room code and Start button
		expect(screen.getByText('testroom')).toBeInTheDocument()
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
		expect(screen.getByText('Join')).toBeInTheDocument()
		expect(screen.getByPlaceholderText('e.g. abc23')).toBeInTheDocument()
	})

	it('Join button is disabled without room code', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('Join by Code'))
		expect(screen.getByText('Join')).toBeDisabled()
	})

	it('typing room code and clicking Join calls onJoin', async () => {
		render(SessionLobby, { props: { onJoin } })
		await fireEvent.click(screen.getByText('Join by Code'))
		const input = screen.getByPlaceholderText('e.g. abc23')
		await fireEvent.input(input, { target: { value: 'myroom' } })
		await fireEvent.click(screen.getByText('Join'))
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
})
