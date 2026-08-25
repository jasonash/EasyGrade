import { describe, expect, it } from 'vitest'
import { csvEscape, fileSlug, toCsv } from '../../src/shared/csv'

describe('csv', () => {
  it('quotes only what needs quoting', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('has, comma')).toBe('"has, comma"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('two\nlines')).toBe('"two\nlines"')
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(csvEscape(12)).toBe('12')
  })

  it('writes a BOM, CRLF rows, and a trailing newline', () => {
    expect(toCsv([['a', 'b'], [1, null]])).toBe('﻿a,b\r\n1,\r\n')
  })

  it('slugs titles for file names', () => {
    expect(fileSlug('Unit 3 Quiz: Acids & Bases')).toBe('unit-3-quiz-acids-bases')
    expect(fileSlug('   ')).toBe('export')
    expect(fileSlug('Café Test')).toBe('cafe-test')
  })
})
