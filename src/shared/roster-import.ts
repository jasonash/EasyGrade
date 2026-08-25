/**
 * Roster import parsing. Pure functions, no I/O, shared by main (import
 * preview) and tests.
 *
 * Accepts CSV (with quoted fields) or tab-separated text pasted from a
 * spreadsheet. A header row is optional. Columns may be split
 * (last, first, student number) or a single combined "Last, First" column
 * with an optional student number beside it.
 */

import type { ImportRow } from './schemas/student'

export type Delimiter = 'comma' | 'tab'

export interface ParsedRosterRow {
  /** 1-based line number in the source text, for error messages. */
  line: number
  lastName: string
  firstName: string
  studentNumber: string | null
  error: string | null
}

export interface ParsedRoster {
  rows: ParsedRosterRow[]
  delimiter: Delimiter
  hasHeader: boolean
  /** Set when the whole input is unusable (for example a header without name columns). */
  error: string | null
}

export const ROSTER_TEMPLATE_FILENAME = 'easygrade-roster-template.csv'
export const ROSTER_TEMPLATE_CSV = 'last_name,first_name,student_number\nAdams,Maria,100234\nBaker,Devon,100251\n'

export const MAX_NAME_LENGTH = 60
export const MAX_STUDENT_NUMBER_LENGTH = 32

type Column = 'last' | 'first' | 'number' | 'name' | 'ignore'

const HEADER_TOKENS: Record<string, Column> = {
  last: 'last',
  lastname: 'last',
  surname: 'last',
  familyname: 'last',
  first: 'first',
  firstname: 'first',
  givenname: 'first',
  number: 'number',
  studentnumber: 'number',
  studentno: 'number',
  studentid: 'number',
  id: 'number',
  sid: 'number',
  name: 'name',
  fullname: 'name',
  studentname: 'name',
  student: 'name'
}

export function parseRosterText(text: string): ParsedRoster {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const nonBlank: { line: number; text: string }[] = []
  lines.forEach((raw, i) => {
    if (raw.trim() !== '') nonBlank.push({ line: i + 1, text: raw })
  })
  if (nonBlank.length === 0) {
    return { rows: [], delimiter: 'comma', hasHeader: false, error: 'Nothing to import: the text is empty' }
  }

  const delimiter: Delimiter = nonBlank.some((l) => l.text.includes('\t')) ? 'tab' : 'comma'
  const records = nonBlank.map((l) => ({ line: l.line, cells: splitLine(l.text, delimiter) }))

  const first = records[0]
  const headerMap = first ? detectHeader(first.cells) : null
  const hasHeader = headerMap !== null
  const dataRecords = hasHeader ? records.slice(1) : records

  if (headerMap) {
    const hasName = headerMap.includes('name')
    const hasSplit = headerMap.includes('last') && headerMap.includes('first')
    if (!hasName && !hasSplit) {
      return {
        rows: [],
        delimiter,
        hasHeader,
        error: 'The header row needs last_name and first_name columns, or a single name column'
      }
    }
  }

  const rows = dataRecords.map((record) =>
    headerMap ? rowFromHeader(record.line, record.cells, headerMap) : rowFromShape(record.line, record.cells)
  )
  return { rows, delimiter, hasHeader, error: null }
}

/** Split a line into trimmed cells. CSV honors double-quoted fields with "" escapes. */
export function splitLine(line: string, delimiter: Delimiter): string[] {
  if (delimiter === 'tab') return line.split('\t').map((c) => c.trim())
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i)
    if (inQuotes) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function normalizeHeaderCell(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Returns a column map when every non-empty cell is a recognized header word. */
function detectHeader(cells: string[]): Column[] | null {
  const nonEmpty = cells.filter((c) => c !== '')
  if (nonEmpty.length === 0) return null
  const map: Column[] = []
  for (const cell of cells) {
    if (cell === '') {
      map.push('ignore')
      continue
    }
    const column = HEADER_TOKENS[normalizeHeaderCell(cell)]
    if (!column) return null
    map.push(column)
  }
  return map
}

function rowFromHeader(line: number, cells: string[], map: Column[]): ParsedRosterRow {
  let last = ''
  let first = ''
  let number = ''
  let name = ''
  map.forEach((column, i) => {
    const value = cells[i] ?? ''
    if (column === 'last') last = value
    else if (column === 'first') first = value
    else if (column === 'number') number = value
    else if (column === 'name') name = value
  })
  if (last === '' && first === '' && name !== '') {
    const split = splitCombinedName(name)
    if (!split) return errorRow(line, '', name, number, 'Name must be written as "Last, First"')
    last = split.lastName
    first = split.firstName
  }
  return finishRow(line, last, first, number)
}

/** No header: infer the layout from the shape of each row. */
function rowFromShape(line: number, cells: string[]): ParsedRosterRow {
  const filled = cells.filter((c) => c !== '')
  const c0 = cells[0] ?? ''
  const c1 = cells[1] ?? ''
  const c2 = cells[2] ?? ''

  if (filled.length === 0) return errorRow(line, '', '', '', 'Empty row')

  if (cells.length === 1) {
    const split = splitCombinedName(c0)
    if (!split) return errorRow(line, '', c0, '', 'Name must be written as "Last, First"')
    return finishRow(line, split.lastName, split.firstName, '')
  }

  if (cells.length === 2) {
    if (c0.includes(',')) {
      const split = splitCombinedName(c0)
      if (!split) return errorRow(line, '', c0, c1, 'Name must be written as "Last, First"')
      return finishRow(line, split.lastName, split.firstName, c1)
    }
    return finishRow(line, c0, c1, '')
  }

  if (c0.includes(',')) {
    const split = splitCombinedName(c0)
    if (!split) return errorRow(line, '', c0, c1, 'Name must be written as "Last, First"')
    return finishRow(line, split.lastName, split.firstName, c1)
  }
  return finishRow(line, c0, c1, c2)
}

/** "Doe, Jane Marie" -> { lastName: "Doe", firstName: "Jane Marie" }. Returns null without a comma. */
export function splitCombinedName(value: string): { lastName: string; firstName: string } | null {
  const idx = value.indexOf(',')
  if (idx < 0) return null
  return { lastName: value.slice(0, idx).trim(), firstName: value.slice(idx + 1).trim() }
}

function finishRow(line: number, last: string, first: string, number: string): ParsedRosterRow {
  const lastName = last.trim()
  const firstName = first.trim()
  const studentNumber = number.trim()
  let error: string | null = null
  if (lastName === '' && firstName === '') error = 'Missing name'
  else if (lastName === '') error = 'Missing last name'
  else if (firstName === '') error = 'Missing first name'
  else if (lastName.length > MAX_NAME_LENGTH) error = `Last name is longer than ${MAX_NAME_LENGTH} characters`
  else if (firstName.length > MAX_NAME_LENGTH) error = `First name is longer than ${MAX_NAME_LENGTH} characters`
  else if (studentNumber.length > MAX_STUDENT_NUMBER_LENGTH)
    error = `Student number is longer than ${MAX_STUDENT_NUMBER_LENGTH} characters`
  return { line, lastName, firstName, studentNumber: studentNumber === '' ? null : studentNumber, error }
}

function errorRow(line: number, last: string, first: string, number: string, error: string): ParsedRosterRow {
  return {
    line,
    lastName: last.trim(),
    firstName: first.trim(),
    studentNumber: number.trim() === '' ? null : number.trim(),
    error
  }
}

export interface ExistingStudent {
  lastName: string
  firstName: string
  studentNumber: string | null
  active: boolean
}

function nameKey(last: string, first: string): string {
  return `${last.trim().toLowerCase().replace(/\s+/g, ' ')}|${first.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

function numberKey(value: string | null): string | null {
  if (value === null) return null
  const key = value.trim().toLowerCase()
  return key === '' ? null : key
}

/**
 * Assign a status to every parsed row: errors stay errors, rows matching a
 * student already on the roster (by student number, then by name) or an
 * earlier row in the same import become duplicates, everything else is new.
 */
export function classifyImportRows(parsed: ParsedRosterRow[], existing: ExistingStudent[]): ImportRow[] {
  const byNumber = new Map<string, ExistingStudent>()
  const byName = new Map<string, ExistingStudent>()
  for (const student of existing) {
    const nk = numberKey(student.studentNumber)
    if (nk !== null && !byNumber.has(nk)) byNumber.set(nk, student)
    const key = nameKey(student.lastName, student.firstName)
    if (!byName.has(key)) byName.set(key, student)
  }

  const seenNumbers = new Map<string, number>()
  const seenNames = new Map<string, number>()
  const out: ImportRow[] = []

  for (const row of parsed) {
    const base = {
      line: row.line,
      lastName: row.lastName,
      firstName: row.firstName,
      studentNumber: row.studentNumber
    }
    if (row.error) {
      out.push({ ...base, status: 'error', message: row.error })
      continue
    }
    const nk = numberKey(row.studentNumber)
    const key = nameKey(row.lastName, row.firstName)

    const existingByNumber = nk !== null ? byNumber.get(nk) : undefined
    const existingByName = byName.get(key)
    const match = existingByNumber ?? existingByName
    if (match) {
      const who = `${match.lastName}, ${match.firstName}`
      const via = existingByNumber ? `student number ${row.studentNumber ?? ''}` : 'name'
      const state = match.active ? '' : ' (inactive)'
      out.push({ ...base, status: 'duplicate', message: `Already on the roster${state} as ${who}, matched by ${via}` })
      continue
    }

    const earlierByNumber = nk !== null ? seenNumbers.get(nk) : undefined
    const earlierByName = seenNames.get(key)
    const earlier = earlierByNumber ?? earlierByName
    if (earlier !== undefined) {
      out.push({ ...base, status: 'duplicate', message: `Repeats line ${earlier}` })
      continue
    }

    if (nk !== null) seenNumbers.set(nk, row.line)
    seenNames.set(key, row.line)
    out.push({ ...base, status: 'new', message: null })
  }
  return out
}
