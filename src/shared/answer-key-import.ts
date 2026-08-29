import { CHOICE_LETTERS } from './layout/constants'
import type { LabelStyle } from './schemas/test'

/**
 * "Paste answer key" for answer sheets. The teacher's document already has
 * the key, so accept whatever shape it comes in: numbered entries such as
 * "1. B", "1) B", "1: B", "1-B", "Q1 B", one per line or run together; or a
 * bare sequence such as "B D A C", "B, D, A, C", or "BDAC". True/false rows
 * take T, F, True, False (and A/B); letters rows also accept T/F, mapped
 * to the first two bubbles with a note.
 */

export interface KeyRowSpec {
  choiceCount: number
  labelStyle: LabelStyle
}

export interface AnswerKeyParse {
  /** One entry per row: the parsed choice, or null to leave that row unchanged. */
  answers: (number | null)[]
  /** Rows the paste assigned. */
  found: number
  /** Things the teacher should look at; never fatal. */
  issues: string[]
  /** Set only when nothing usable was found. */
  error: string | null
}

const NUMBERED = /(?:^|[\s,;(])(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-–]?\s*(true|false|[a-h]|[tf])(?![a-z])/gi
/** A run of answers with nothing between them, "BDAC"; uppercase only so prose like "the" never counts. */
const LETTER_RUN = /^[A-HTF]+$/

interface Token {
  value: string
  /** 1-based question number when the paste numbered it. */
  number: number | null
}

function tokenize(text: string): { tokens: Token[]; numbered: boolean } {
  const cleaned = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*_`]/g, '')
  const numbered: Token[] = []
  for (const match of cleaned.matchAll(NUMBERED)) {
    const number = Number(match[1])
    const value = match[2] ?? ''
    if (number >= 1 && value) numbered.push({ value, number })
  }
  if (numbered.length > 0) return { tokens: numbered, numbered: true }

  const tokens: Token[] = []
  for (const raw of cleaned.split(/[\s,;|/]+/)) {
    const word = raw.replace(/[.)\]:]+$/g, '')
    if (word === '') continue
    if (/^(true|false)$/i.test(word) || /^[a-htf]$/i.test(word)) {
      tokens.push({ value: word, number: null })
    } else if (LETTER_RUN.test(word)) {
      for (const ch of word) tokens.push({ value: ch, number: null })
    }
  }
  return { tokens, numbered: false }
}

/** Choice index for a token on a row, or an issue string. */
function resolve(value: string, row: KeyRowSpec, n: number): { choice: number | null; issue: string | null } {
  const v = value.toUpperCase()
  const isTrue = v === 'T' || v === 'TRUE'
  const isFalse = v === 'F' || v === 'FALSE'
  if (row.labelStyle === 'true_false') {
    if (isTrue || v === 'A') return { choice: 0, issue: null }
    if (isFalse || v === 'B') return { choice: 1, issue: null }
    return { choice: null, issue: `Question ${n}: "${value}" is not T or F` }
  }
  if (isTrue || isFalse) {
    if (row.choiceCount < 2) return { choice: null, issue: `Question ${n}: "${value}" does not fit a ${row.choiceCount}-bubble row` }
    const letter = isTrue ? 'A' : 'B'
    return { choice: isTrue ? 0 : 1, issue: `Question ${n}: ${value.toUpperCase()} taken as ${letter}` }
  }
  const index = CHOICE_LETTERS.indexOf(v as (typeof CHOICE_LETTERS)[number])
  if (index < 0) return { choice: null, issue: `Question ${n}: "${value}" is not a choice letter` }
  if (index >= row.choiceCount) {
    return { choice: null, issue: `Question ${n}: ${v} is beyond its ${row.choiceCount} bubbles` }
  }
  return { choice: index, issue: null }
}

export function parseAnswerKey(text: string, rows: KeyRowSpec[]): AnswerKeyParse {
  const answers: (number | null)[] = rows.map(() => null)
  const issues: string[] = []
  const { tokens, numbered } = tokenize(text)
  if (tokens.length === 0) {
    return { answers, found: 0, issues, error: 'No answers found. Paste something like "1. B  2. D  3. A" or "B D A".' }
  }

  let found = 0
  const seen = new Set<number>()
  let beyond = 0
  tokens.forEach((token, i) => {
    const index = numbered ? (token.number ?? 0) - 1 : i
    const row = rows[index]
    if (!row) {
      beyond++
      return
    }
    const n = index + 1
    if (seen.has(index)) issues.push(`Question ${n} appears more than once; the last one wins`)
    const { choice, issue } = resolve(token.value, row, n)
    if (issue) issues.push(issue)
    if (choice !== null) {
      if (!seen.has(index)) found++
      answers[index] = choice
    }
    seen.add(index)
  })

  if (beyond > 0) {
    issues.push(
      numbered
        ? `${beyond} ${beyond === 1 ? 'entry is' : 'entries are'} numbered past question ${rows.length} and ${beyond === 1 ? 'was' : 'were'} ignored`
        : `Found ${tokens.length} answers but the sheet has ${rows.length} questions; the extra ${beyond} ${beyond === 1 ? 'was' : 'were'} ignored`
    )
  }
  const missing = rows.length - seen.size
  if (missing > 0 && seen.size > 0) {
    issues.push(`${missing} ${missing === 1 ? 'question was' : 'questions were'} not in the paste and ${missing === 1 ? 'keeps' : 'keep'} the current answer`)
  }
  return { answers, found, issues, error: found === 0 ? 'No answers matched the sheet. Check the numbering and letters.' : null }
}
