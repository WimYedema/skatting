import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstimatedTicket } from '../lib/types'
import BacklogPanel from './BacklogPanel.svelte'

function makeTickets(n: number): EstimatedTicket[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `T${i + 1}`,
		title: `Ticket ${i + 1}`,
	}))
}

function defaultProps() {
	return {
		tickets: makeTickets(3),
		currentIndex: 0,
		isCreator: true,
		prepMode: true,
		myEstimates: new Map<string, { mu: number; sigma: number }>(),
		estimatedCount: 0,
		onSelect: vi.fn(),
		onReorder: vi.fn(),
		onRemove: vi.fn(),
		onExportCsv: vi.fn(),
		onExportExcel: vi.fn(),
	}
}

describe('BacklogPanel', () => {
	afterEach(() => {
		cleanup()
	})

	it('renders ticket list', () => {
		const props = defaultProps()
		render(BacklogPanel, { props })
		expect(screen.getByText('T1')).toBeInTheDocument()
		expect(screen.getByText('T2')).toBeInTheDocument()
		expect(screen.getByText('T3')).toBeInTheDocument()
	})

	it('renders ticket titles', () => {
		const props = defaultProps()
		render(BacklogPanel, { props })
		expect(screen.getByText('Ticket 1')).toBeInTheDocument()
		expect(screen.getByText('Ticket 2')).toBeInTheDocument()
	})

	it('clicking ticket calls onSelect', async () => {
		const props = defaultProps()
		render(BacklogPanel, { props })
		await fireEvent.click(screen.getByText('T2'))
		expect(props.onSelect).toHaveBeenCalledWith(1)
	})

	it('shows remove buttons for creator', () => {
		const props = defaultProps()
		render(BacklogPanel, { props })
		const removeButtons = screen.getAllByTitle('Remove ticket')
		expect(removeButtons).toHaveLength(3)
	})

	it('hides remove buttons for non-creator', () => {
		const props = defaultProps()
		props.isCreator = false
		render(BacklogPanel, { props })
		expect(screen.queryAllByTitle('Remove ticket')).toHaveLength(0)
	})

	it('clicking remove calls onRemove', async () => {
		const props = defaultProps()
		render(BacklogPanel, { props })
		const removeButtons = screen.getAllByTitle('Remove ticket')
		await fireEvent.click(removeButtons[1])
		expect(props.onRemove).toHaveBeenCalledWith(1)
	})

	it('disables ticket buttons for non-creator in meeting mode', () => {
		const props = defaultProps()
		props.isCreator = false
		props.prepMode = false
		render(BacklogPanel, { props })
		const buttons = screen.getAllByRole('button', { name: /Ticket/ })
		for (const btn of buttons) {
			expect(btn).toBeDisabled()
		}
	})

	it('shows estimated checkmarks', () => {
		const props = defaultProps()
		props.tickets = [
			{ id: 'T1', title: 'Done', median: 5, p10: 2, p90: 10 },
			{ id: 'T2', title: 'Not done' },
		]
		render(BacklogPanel, { props })
		expect(screen.getByText('✓')).toBeInTheDocument()
		expect(screen.getByText('5.0')).toBeInTheDocument()
	})

	it('shows prepared indicator for prep-mode estimates', () => {
		const props = defaultProps()
		props.myEstimates = new Map([['T1', { mu: 2, sigma: 0.4 }]])
		render(BacklogPanel, { props })
		expect(screen.getByText('●')).toBeInTheDocument()
	})

	it('shows export buttons when estimatedCount > 0', () => {
		const props = defaultProps()
		props.estimatedCount = 1
		render(BacklogPanel, { props })
		expect(screen.getByText('CSV ↓')).toBeInTheDocument()
		expect(screen.getByText('Excel ↓')).toBeInTheDocument()
	})

	it('hides export buttons when estimatedCount is 0', () => {
		const props = defaultProps()
		props.estimatedCount = 0
		render(BacklogPanel, { props })
		expect(screen.queryByText('CSV ↓')).not.toBeInTheDocument()
	})

	it('clicking CSV export calls callback', async () => {
		const props = defaultProps()
		props.estimatedCount = 1
		render(BacklogPanel, { props })
		await fireEvent.click(screen.getByText('CSV ↓'))
		expect(props.onExportCsv).toHaveBeenCalled()
	})

	it('clicking Excel export calls callback', async () => {
		const props = defaultProps()
		props.estimatedCount = 1
		render(BacklogPanel, { props })
		await fireEvent.click(screen.getByText('Excel ↓'))
		expect(props.onExportExcel).toHaveBeenCalled()
	})

	it('shows progress count', () => {
		const props = defaultProps()
		props.myEstimates = new Map([
			['T1', { mu: 2, sigma: 0.4 }],
			['T2', { mu: 3, sigma: 0.5 }],
		])
		render(BacklogPanel, { props })
		expect(screen.getByText('2/3 prepared')).toBeInTheDocument()
	})

	it('shows done count when estimated', () => {
		const props = defaultProps()
		props.estimatedCount = 2
		render(BacklogPanel, { props })
		expect(screen.getByText('2/3 done')).toBeInTheDocument()
	})
})
