import { describe, expect, it } from 'vitest'
import {
  classifyImportRows,
  parseRosterText,
  splitCombinedName,
  splitLine,
  type ExistingStudent
} from '../../src/shared/roster-import'

describe('splitLine', () => {
  it('splits tab-separated cells and trims them', () => {
    expect(splitLine(' Adams \tMaria\t 100234 ', 'tab')).toEqual(['Adams', 'Maria', '100234'])
  })

  it('splits simple CSV', () => {
    expect(splitLine('Adams,Maria,100234', 'comma')).toEqual(['Adams', 'Maria', '100234'])
  })

  it('honors quoted fields with commas and escaped quotes', () => {
    expect(splitLine('"Adams, Maria",100234', 'comma')).toEqual(['Adams, Maria', '100234'])
    expect(splitLine('"O""Brien",Sean', 'comma')).toEqual(['O"Brien', 'Sean'])
  })

  it('keeps empty trailing cells', () => {
    expect(splitLine('Adams,Maria,', 'comma')).toEqual(['Adams', 'Maria', ''])
  })
})

describe('splitCombinedName', () => {
  it('splits on the first comma only', () => {
    expect(splitCombinedName('Doe, Jane Marie')).toEqual({ lastName: 'Doe', firstName: 'Jane Marie' })
    expect(splitCombinedName('Doe,Jane, Jr.')).toEqual({ lastName: 'Doe', firstName: 'Jane, Jr.' })
  })

  it('returns null without a comma', () => {
    expect(splitCombinedName('Jane Doe')).toBeNull()
  })
})

describe('parseRosterText', () => {
  it('parses the CSV template with header', () => {
    const result = parseRosterText('last_name,first_name,student_number\nAdams,Maria,100234\nBaker,Devon,100251\n')
    expect(result.error).toBeNull()
    expect(result.hasHeader).toBe(true)
    expect(result.delimiter).toBe('comma')
    expect(result.rows).toEqual([
      { line: 2, lastName: 'Adams', firstName: 'Maria', studentNumber: '100234', error: null },
      { line: 3, lastName: 'Baker', firstName: 'Devon', studentNumber: '100251', error: null }
    ])
  })

  it('parses header-less three-column CSV', () => {
    const result = parseRosterText('Adams,Maria,100234\nBaker,Devon,100251')
    expect(result.hasHeader).toBe(false)
    expect(result.rows.map((r) => [r.lastName, r.firstName, r.studentNumber])).toEqual([
      ['Adams', 'Maria', '100234'],
      ['Baker', 'Devon', '100251']
    ])
  })

  it('parses header-less two-column last,first', () => {
    const result = parseRosterText('Adams,Maria\nBaker,Devon')
    expect(result.rows.map((r) => [r.lastName, r.firstName, r.studentNumber])).toEqual([
      ['Adams', 'Maria', null],
      ['Baker', 'Devon', null]
    ])
  })

  it('parses tab-separated paste from a spreadsheet', () => {
    const result = parseRosterText('Adams\tMaria\t100234\r\nBaker\tDevon\t100251\r\n')
    expect(result.delimiter).toBe('tab')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]).toMatchObject({ line: 2, lastName: 'Baker', firstName: 'Devon', studentNumber: '100251' })
  })

  it('recognizes friendly header names and reorders columns', () => {
    const result = parseRosterText('Student ID\tFirst Name\tLast Name\n100234\tMaria\tAdams')
    expect(result.hasHeader).toBe(true)
    expect(result.rows[0]).toMatchObject({ lastName: 'Adams', firstName: 'Maria', studentNumber: '100234' })
  })

  it('accepts a combined Last, First column with a header', () => {
    const result = parseRosterText('Name,ID\n"Adams, Maria",100234\n"Baker, Devon",')
    expect(result.rows).toEqual([
      { line: 2, lastName: 'Adams', firstName: 'Maria', studentNumber: '100234', error: null },
      { line: 3, lastName: 'Baker', firstName: 'Devon', studentNumber: null, error: null }
    ])
  })

  it('accepts a combined Last, First column without a header (quoted CSV)', () => {
    const result = parseRosterText('"Adams, Maria",100234\n"Baker, Devon",100251')
    expect(result.rows.map((r) => [r.lastName, r.firstName, r.studentNumber])).toEqual([
      ['Adams', 'Maria', '100234'],
      ['Baker', 'Devon', '100251']
    ])
  })

  it('accepts a combined Last, First column in tab-separated paste', () => {
    const result = parseRosterText('Adams, Maria\t100234\nBaker, Devon\t100251\nCruz, Ana')
    expect(result.rows.map((r) => [r.lastName, r.firstName, r.studentNumber])).toEqual([
      ['Adams', 'Maria', '100234'],
      ['Baker', 'Devon', '100251'],
      ['Cruz', 'Ana', null]
    ])
  })

  it('treats unquoted "Last, First" lines as two CSV columns', () => {
    const result = parseRosterText('Adams, Maria\nBaker, Devon')
    expect(result.rows.map((r) => [r.lastName, r.firstName])).toEqual([
      ['Adams', 'Maria'],
      ['Baker', 'Devon']
    ])
  })

  it('uses the cell beside a combined name as the student number in tab mode', () => {
    const result = parseRosterText('Adams, Maria\tBaker\n')
    // Tab present, so tab mode: cell 0 has a comma so it is a combined name, cell 1 the number.
    expect(result.rows[0]).toMatchObject({ lastName: 'Adams', firstName: 'Maria', studentNumber: 'Baker' })
  })

  it('flags rows with missing names', () => {
    const result = parseRosterText('last_name,first_name,student_number\n,Maria,1\nBaker,,2\n,,3')
    expect(result.rows.map((r) => r.error)).toEqual(['Missing last name', 'Missing first name', 'Missing name'])
  })

  it('flags single-column rows that are not Last, First', () => {
    const result = parseRosterText('Jane Doe\nSmith, John')
    expect(result.rows[0]?.error).toBe('Name must be written as "Last, First"')
    expect(result.rows[1]).toMatchObject({ lastName: 'Smith', firstName: 'John', error: null })
  })

  it('flags over-long values', () => {
    const long = 'x'.repeat(61)
    const result = parseRosterText(`${long},Maria\nAdams,${long}\nAdams,Maria,${'9'.repeat(33)}`)
    expect(result.rows.map((r) => r.error)).toEqual([
      'Last name is longer than 60 characters',
      'First name is longer than 60 characters',
      'Student number is longer than 32 characters'
    ])
  })

  it('skips blank lines and keeps original line numbers', () => {
    const result = parseRosterText('\n\nAdams,Maria\n\n\nBaker,Devon\n')
    expect(result.rows.map((r) => r.line)).toEqual([3, 6])
  })

  it('strips a UTF-8 BOM before the header', () => {
    const result = parseRosterText('\uFEFFlast_name,first_name\nAdams,Maria')
    expect(result.hasHeader).toBe(true)
    expect(result.rows[0]).toMatchObject({ lastName: 'Adams', firstName: 'Maria' })
  })

  it('reports empty input', () => {
    expect(parseRosterText('   \n\n').error).toBe('Nothing to import: the text is empty')
  })

  it('rejects a header without name columns', () => {
    const result = parseRosterText('id,number\n1,2')
    expect(result.error).toMatch(/last_name and first_name/)
    expect(result.rows).toEqual([])
  })

  it('does not mistake a data row for a header', () => {
    const result = parseRosterText('First,Last\nLast,First')
    // "First,Last" is a header (first=first name, last=last name); second line is data.
    expect(result.hasHeader).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ firstName: 'Last', lastName: 'First' })

    const plain = parseRosterText('Adams,Maria\nBaker,Devon')
    expect(plain.hasHeader).toBe(false)
    expect(plain.rows).toHaveLength(2)
  })
})

describe('classifyImportRows', () => {
  const existing: ExistingStudent[] = [
    { lastName: 'Adams', firstName: 'Maria', studentNumber: '100234', active: true },
    { lastName: 'Old', firstName: 'Student', studentNumber: null, active: false }
  ]

  it('marks new, duplicate, and error rows and preserves order', () => {
    const parsed = parseRosterText(
      [
        'Baker,Devon,100251',
        'adams , MARIA ,',
        'Cruz,Ana,100234',
        ',Nobody,',
        'Baker,Devon,100999',
        'Diaz,Ana,100251',
        'old,student,'
      ].join('\n')
    ).rows
    const rows = classifyImportRows(parsed, existing)
    expect(rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'duplicate', 'error', 'duplicate', 'duplicate', 'duplicate'])
    expect(rows[1]?.message).toContain('matched by name')
    expect(rows[2]?.message).toContain('matched by student number 100234')
    expect(rows[3]?.message).toBe('Missing last name')
    expect(rows[4]?.message).toBe('Repeats line 1')
    expect(rows[5]?.message).toBe('Repeats line 1')
    expect(rows[6]?.message).toContain('(inactive)')
  })

  it('treats a student number match as a duplicate even when the name differs', () => {
    const rows = classifyImportRows(parseRosterText('Adams-Lee,Maria,100234').rows, existing)
    expect(rows[0]?.status).toBe('duplicate')
  })

  it('allows the same name with different numbers when neither is on the roster', () => {
    const rows = classifyImportRows(parseRosterText('Smith,John,1\nSmith,John,2').rows, [])
    // Same name repeated in one import is flagged so the teacher can decide.
    expect(rows.map((r) => r.status)).toEqual(['new', 'duplicate'])
  })
})
