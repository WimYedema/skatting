import type { EstimatedTicket, ImportedTicket } from './types'

/** Known column name variants mapped to ImportedTicket fields */
const COLUMN_ALIASES: Record<string, keyof ImportedTicket> = {
	id: 'id',
	key: 'id',
	'issue key': 'id',
	'issue id': 'id',
	'ticket id': 'id',
	ticket: 'id',
	number: 'id',
	'#': 'id',
	title: 'title',
	summary: 'title',
	name: 'title',
	'issue title': 'title',
	subject: 'title',
	url: 'url',
	link: 'url',
	'issue url': 'url',
	labels: 'labels',
	label: 'labels',
	tags: 'labels',
	tag: 'labels',
	assignee: 'assignee',
	'assigned to': 'assignee',
	owner: 'assignee',
	description: 'description',
	desc: 'description',
	details: 'description',
}

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles double-quoted fields with embedded commas and escaped quotes ("").
 */
export function parseCsvLine(line: string): string[] {
	const fields: string[] = []
	let current = ''
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"'
					i++ // skip escaped quote
				} else {
					inQuotes = false
				}
			} else {
				current += ch
			}
		} else if (ch === '"') {
			inQuotes = true
		} else if (ch === ',') {
			fields.push(current.trim())
			current = ''
		} else {
			current += ch
		}
	}
	fields.push(current.trim())
	return fields
}

/**
 * Parse CSV text into an array of ImportedTicket.
 * First row is treated as headers. Column names are matched flexibly.
 * Rows missing both id and title are skipped.
 */
export function parseCsv(text: string): ImportedTicket[] {
	const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
	if (lines.length < 2) return []

	const headers = parseCsvLine(lines[0])
	const columnMap = new Map<number, keyof ImportedTicket>()

	for (let i = 0; i < headers.length; i++) {
		const normalized = headers[i].toLowerCase().trim()
		const field = COLUMN_ALIASES[normalized]
		if (field) {
			columnMap.set(i, field)
		}
	}

	// Must have at least an id or title column
	const fields = new Set(columnMap.values())
	if (!fields.has('id') && !fields.has('title')) return []

	const tickets: ImportedTicket[] = []
	for (let row = 1; row < lines.length; row++) {
		const values = parseCsvLine(lines[row])
		const ticket: Partial<ImportedTicket> = {}

		for (const [colIndex, field] of columnMap) {
			const value = values[colIndex]
			if (value === undefined || value === '') continue

			if (field === 'labels') {
				ticket.labels = value
					.split(/[;|]/)
					.map((l) => l.trim())
					.filter(Boolean)
			} else {
				ticket[field] = value
			}
		}

		// Skip rows with no meaningful content
		if (!ticket.id && !ticket.title) continue

		tickets.push({
			id: ticket.id ?? `row-${row}`,
			title: ticket.title ?? ticket.id ?? '',
			url: ticket.url,
			labels: ticket.labels,
			assignee: ticket.assignee,
			description: ticket.description,
		})
	}

	return tickets
}

/**
 * Parse plain text (one title per line) into ImportedTicket[].
 * Empty/whitespace-only lines are skipped.
 */
export function parseList(text: string): ImportedTicket[] {
	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0)
		.map((title, i) => ({
			id: `item-${i + 1}`,
			title,
		}))
}

/**
 * Export estimated tickets to CSV string.
 */
export function exportToCsv(tickets: EstimatedTicket[]): string {
	const headers = ['ID', 'Title', 'URL', 'Labels', 'Assignee', 'Median', 'P10', 'P90', 'Unit']
	const rows = tickets.map((t) => [
		escapeCsvField(t.id),
		escapeCsvField(t.title),
		escapeCsvField(t.url ?? ''),
		escapeCsvField((t.labels ?? []).join('; ')),
		escapeCsvField(t.assignee ?? ''),
		t.median != null ? t.median.toFixed(1) : '',
		t.p10 != null ? t.p10.toFixed(1) : '',
		t.p90 != null ? t.p90.toFixed(1) : '',
		t.estimateUnit ?? '',
	])
	return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

function escapeCsvField(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`
	}
	return value
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

/**
 * Export estimated tickets to XML Spreadsheet 2003 format (.xls).
 * Opens natively in Excel, LibreOffice, and Google Sheets — no binary dependency needed.
 */
export function exportToXls(tickets: EstimatedTicket[]): string {
	const headers = ['ID', 'Title', 'URL', 'Labels', 'Assignee', 'Median', 'P10', 'P90', 'Unit']

	let rows = ''
	// Header row
	rows += '<Row>'
	for (const h of headers) {
		rows += `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
	}
	rows += '</Row>\n'

	// Data rows
	for (const t of tickets) {
		const values: Array<{ value: string; type: string }> = [
			{ value: t.id, type: 'String' },
			{ value: t.title, type: 'String' },
			{ value: t.url ?? '', type: 'String' },
			{ value: (t.labels ?? []).join('; '), type: 'String' },
			{ value: t.assignee ?? '', type: 'String' },
			{
				value: t.median != null ? t.median.toFixed(1) : '',
				type: t.median != null ? 'Number' : 'String',
			},
			{ value: t.p10 != null ? t.p10.toFixed(1) : '', type: t.p10 != null ? 'Number' : 'String' },
			{ value: t.p90 != null ? t.p90.toFixed(1) : '', type: t.p90 != null ? 'Number' : 'String' },
			{ value: t.estimateUnit ?? '', type: 'String' },
		]
		rows += '<Row>'
		for (const v of values) {
			rows += `<Cell><Data ss:Type="${v.type}">${escapeXml(v.value)}</Data></Cell>`
		}
		rows += '</Row>\n'
	}

	return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Estimates">
<Table>
${rows}</Table>
</Worksheet>
</Workbook>`
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}
