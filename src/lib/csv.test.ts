import { describe, expect, it } from 'vitest'
import { exportToCsv, parseCsv, parseCsvLine } from './csv'
import type { EstimatedTicket } from './types'

describe('parseCsvLine', () => {
	it('splits simple comma-separated values', () => {
		expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
	})

	it('handles quoted fields with commas', () => {
		expect(parseCsvLine('hello,"world, goodbye",end')).toEqual(['hello', 'world, goodbye', 'end'])
	})

	it('handles escaped quotes inside quoted fields', () => {
		expect(parseCsvLine('"say ""hi""",ok')).toEqual(['say "hi"', 'ok'])
	})

	it('trims whitespace from fields', () => {
		expect(parseCsvLine(' a , b , c ')).toEqual(['a', 'b', 'c'])
	})

	it('handles empty fields', () => {
		expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c'])
	})
})

describe('parseCsv', () => {
	it('parses a standard CSV with ID and Title', () => {
		const csv =
			'ID,Title,URL\nPROJ-1,Fix login bug,https://jira.example.com/PROJ-1\nPROJ-2,Add search,\n'
		const result = parseCsv(csv)
		expect(result).toHaveLength(2)
		expect(result[0]).toEqual({
			id: 'PROJ-1',
			title: 'Fix login bug',
			url: 'https://jira.example.com/PROJ-1',
			labels: undefined,
			assignee: undefined,
			description: undefined,
		})
		expect(result[1].id).toBe('PROJ-2')
		expect(result[1].url).toBeUndefined()
	})

	it('matches Jira-style column names (Issue Key, Summary)', () => {
		const csv = 'Issue Key,Summary,Assignee\nPROJ-10,Refactor API,Alice\n'
		const result = parseCsv(csv)
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('PROJ-10')
		expect(result[0].title).toBe('Refactor API')
		expect(result[0].assignee).toBe('Alice')
	})

	it('parses labels separated by semicolons', () => {
		const csv = 'ID,Title,Labels\n1,Task,bug;urgent;p1\n'
		const result = parseCsv(csv)
		expect(result[0].labels).toEqual(['bug', 'urgent', 'p1'])
	})

	it('parses labels separated by pipe characters', () => {
		const csv = 'ID,Title,Tags\n1,Task,frontend|backend\n'
		const result = parseCsv(csv)
		expect(result[0].labels).toEqual(['frontend', 'backend'])
	})

	it('skips empty rows', () => {
		const csv = 'ID,Title\n\nPROJ-1,Task 1\n\n\nPROJ-2,Task 2\n'
		const result = parseCsv(csv)
		expect(result).toHaveLength(2)
	})

	it('skips rows with no id and no title', () => {
		const csv = 'ID,Title,URL\nPROJ-1,Good row,\n,,only-url\n'
		const result = parseCsv(csv)
		expect(result).toHaveLength(1)
	})

	it('generates row-based IDs when ID column is missing', () => {
		const csv = 'Title,URL\nFirst task,http://a\nSecond task,http://b\n'
		const result = parseCsv(csv)
		expect(result).toHaveLength(2)
		expect(result[0].id).toBe('row-1')
		expect(result[1].id).toBe('row-2')
	})

	it('returns empty array for header-only CSV', () => {
		expect(parseCsv('ID,Title')).toEqual([])
	})

	it('returns empty array for empty string', () => {
		expect(parseCsv('')).toEqual([])
	})

	it('returns empty array when no recognized columns', () => {
		expect(parseCsv('Foo,Bar\n1,2\n')).toEqual([])
	})

	it('handles quoted fields in data rows', () => {
		const csv = 'ID,Title\nPROJ-1,"Fix the ""login"" page, please"\n'
		const result = parseCsv(csv)
		expect(result[0].title).toBe('Fix the "login" page, please')
	})

	it('handles extra columns gracefully', () => {
		const csv = 'ID,Title,Foo,Bar,URL\n1,Task,x,y,http://a\n'
		const result = parseCsv(csv)
		expect(result[0].id).toBe('1')
		expect(result[0].url).toBe('http://a')
	})

	it('handles description column', () => {
		const csv = 'ID,Title,Description\n1,Task,Some details about the task\n'
		const result = parseCsv(csv)
		expect(result[0].description).toBe('Some details about the task')
	})
})

describe('exportToCsv', () => {
	it('exports tickets with estimate data', () => {
		const tickets: EstimatedTicket[] = [
			{
				id: 'PROJ-1',
				title: 'Fix bug',
				url: 'http://a',
				median: 5.2,
				p10: 2.1,
				p90: 9.3,
				estimateUnit: 'points',
			},
		]
		const csv = exportToCsv(tickets)
		const lines = csv.split('\n')
		expect(lines[0]).toBe('ID,Title,URL,Labels,Assignee,Median,P10,P90,Unit')
		expect(lines[1]).toContain('PROJ-1')
		expect(lines[1]).toContain('Fix bug')
		expect(lines[1]).toContain('5.2')
		expect(lines[1]).toContain('points')
	})

	it('handles tickets without estimates', () => {
		const tickets: EstimatedTicket[] = [{ id: '1', title: 'No estimate yet' }]
		const csv = exportToCsv(tickets)
		const lines = csv.split('\n')
		expect(lines[1]).toBe('1,No estimate yet,,,,,,,')
	})

	it('escapes commas in fields', () => {
		const tickets: EstimatedTicket[] = [{ id: '1', title: 'Fix login, signup flow', median: 3 }]
		const csv = exportToCsv(tickets)
		expect(csv).toContain('"Fix login, signup flow"')
	})

	it('round-trips: parse exported CSV back', () => {
		const tickets: EstimatedTicket[] = [
			{
				id: 'PROJ-1',
				title: 'Task one',
				url: 'http://example.com',
				labels: ['bug', 'p1'],
				assignee: 'Alice',
				median: 5.0,
				p10: 2.0,
				p90: 9.0,
				estimateUnit: 'points',
			},
		]
		const csv = exportToCsv(tickets)
		const parsed = parseCsv(csv)
		expect(parsed).toHaveLength(1)
		expect(parsed[0].id).toBe('PROJ-1')
		expect(parsed[0].title).toBe('Task one')
		expect(parsed[0].url).toBe('http://example.com')
	})
})
