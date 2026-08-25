import { CHOICE_LETTERS, MAX_CHOICES, MAX_CHOICE_CHARS, MAX_QUESTIONS, MAX_STEM_CHARS, MIN_CHOICES } from './layout/constants'
import { unsupportedChars } from './layout/text'

/**
 * "Write questions with AI" without any AI in the app: we hand the teacher a
 * prompt to paste into whatever assistant they use, and parse whatever they
 * paste back. The parser is deliberately forgiving: chat chatter, code fences,
 * markdown bold, several ways of marking the answer, a separate answer key,
 * or a JSON array all work. It doubles as a general "paste questions" import.
 */

export interface ParsedQuestion {
  stem: string
  choices: string[]
  /** Index into choices, or null when nothing marked the answer. */
  correctChoice: number | null
  /** Things the teacher should look at; never fatal. */
  issues: string[]
}

export interface QuestionImportResult {
  questions: ParsedQuestion[]
  /** Set only when nothing usable was found. */
  error: string | null
}

export interface QuestionPromptOptions {
  count: number
  choices: number
  gradeLevel?: string
  topic?: string
}

/** Recommended lengths, comfortably under the hard caps so generated text fits without edits. */
const SUGGESTED_STEM_CHARS = 160
const SUGGESTED_CHOICE_CHARS = 50

export function buildQuestionPrompt(options: QuestionPromptOptions): string {
  const count = Math.max(1, Math.min(MAX_QUESTIONS, Math.round(options.count)))
  const choices = Math.max(MIN_CHOICES, Math.min(MAX_CHOICES, Math.round(options.choices)))
  const letters = CHOICE_LETTERS.slice(0, choices)
  const gradeLevel = options.gradeLevel?.trim()
  const topic = options.topic?.trim()

  const example = [
    '1. Which particle carries a negative charge?',
    ...letters.map((letter, i) => `${letter}) ${['Proton', 'Electron *', 'Neutron', 'Photon', 'Positron'][i] ?? 'Another choice'}`)
  ].join('\n')

  const lines = [
    `Write ${count} multiple-choice quiz question${count === 1 ? '' : 's'}${gradeLevel ? ` for ${gradeLevel} students` : ''}, based only on the material I paste below.`,
    topic ? `Focus: ${topic}` : null,
    '',
    'Format every question exactly like this example, as plain text (no tables, no bold, no markdown):',
    '',
    example,
    '',
    'Rules:',
    `- Number the questions 1 to ${count}. Give each question exactly ${choices} choices labeled ${letters.join(', ')}.`,
    '- Exactly one choice is correct. Mark it with a space and an asterisk after its text, as in the example. Do not mark the others.',
    '- Vary which letter is correct from question to question.',
    `- Keep each question under ${SUGGESTED_STEM_CHARS} characters and each choice under ${SUGGESTED_CHOICE_CHARS} characters; the quiz must fit on one printed page.`,
    '- Test one idea per question, with plausible wrong choices. Do not use "all of the above" or "none of the above".',
    '- Use plain characters only: no symbols, formulas, superscripts, or special punctuation.',
    '- Reply with the questions only: no introduction, explanations, or answer key.',
    '',
    'Here is the material:'
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}

// ---------------------------------------------------------------------------
// Parsing

// Letters past E are accepted only in sequence, so an over-long list is flagged rather than split.
const CHOICE_LINE = /^\s*[(\[]?([A-Ja-j])[)\].:]\s*(.*)$/
const QUESTION_LINE = /^\s*(?:q(?:uestion)?\s*)?(\d{1,2})\s*[.):]\s*(.*)$/i
const ANSWER_LINE = /^\s*(?:\*\*)?(?:correct(?:\s+answer)?|answer|key)\s*[:=]\s*(?:\*\*)?\s*[(\[]?([A-Ea-e])[)\].]?\b/i
const KEY_HEADING = /^\s*(?:\*\*)?(?:answer\s*key|answers|key)\s*(?:\*\*)?\s*:?\s*$/i
const KEY_ENTRY = /(\d{1,2})\s*[.):=-]?\s*[(\[]?([A-Ea-e])\b[)\]]?/g
const TRAILING_CORRECT = /\s*(?:\*+|✓|✔|\(correct\)|\[correct\]|\[x\]|<-+\s*correct)\s*$/i
const LEADING_CORRECT = /^\s*(?:\*+|✓|✔|\[x\])\s*/

interface Block {
  stemLines: string[]
  choices: string[]
  marked: number[]
  boldChoices: number[]
  answerLine: number | null
}

function newBlock(): Block {
  return { stemLines: [], choices: [], marked: [], boldChoices: [], answerLine: null }
}

function letterIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65
}

/** Drop markdown code fences and bold/italic markers that are not answer markers. */
function cleanLines(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .map((line) => line.replace(/\t/g, ' '))
}

/** Whether the text is entirely wrapped in markdown bold (some assistants mark the answer that way). */
function isBold(text: string): boolean {
  return /^\s*\*\*[^*]+\*\*\s*$/.test(text)
}

function stripBold(text: string): string {
  return text.replace(/\*\*/g, '')
}

function parseText(text: string): ParsedQuestion[] {
  const blocks: Block[] = []
  let current: Block | null = null
  let keyMode = false
  const keyAnswers = new Map<number, number>()

  const push = (): void => {
    if (current) blocks.push(current)
    current = newBlock()
  }

  for (const rawLine of cleanLines(text)) {
    const raw = rawLine.trimEnd()
    if (raw.trim() === '') continue
    // Match on the line without bold markers; remember whether the whole line was bold.
    const line = stripBold(raw)
    const lineBold = isBold(raw)

    if (KEY_HEADING.test(line)) {
      keyMode = true
      continue
    }
    if (keyMode) {
      for (const m of line.matchAll(KEY_ENTRY)) {
        const n = Number(m[1])
        const letter = m[2]
        if (letter) keyAnswers.set(n, letterIndex(letter))
      }
      continue
    }

    const answer = ANSWER_LINE.exec(line)
    if (answer && answer[1] && current && current.choices.length > 0) {
      current.answerLine = letterIndex(answer[1])
      continue
    }

    const choice = CHOICE_LINE.exec(line)
    const choiceIndex = choice && choice[1] ? letterIndex(choice[1]) : -1
    const inSequence = choiceIndex >= 0 && (choiceIndex < MAX_CHOICES || choiceIndex === (current?.choices.length ?? -1))
    if (choice && inSequence && current !== null && (current.stemLines.length > 0 || current.choices.length > 0)) {
      const block: Block = current
      const rawBody = CHOICE_LINE.exec(raw)?.[2] ?? ''
      let body = choice[2] ?? ''
      let correct = false
      if (TRAILING_CORRECT.test(body)) {
        body = body.replace(TRAILING_CORRECT, '')
        correct = true
      }
      if (LEADING_CORRECT.test(body)) {
        body = body.replace(LEADING_CORRECT, '')
        correct = true
      }
      body = body.trim()
      const index = block.choices.length
      block.choices.push(body)
      if (correct) block.marked.push(index)
      if (lineBold || isBold(rawBody)) block.boldChoices.push(index)
      continue
    }

    const question = QUESTION_LINE.exec(line)
    if (question) {
      push()
      const block: Block = current ?? newBlock()
      current = block
      const rest = (question[2] ?? '').trim()
      if (rest !== '') block.stemLines.push(rest)
      continue
    }

    // Plain text: continues the stem before any choice, otherwise starts a new (unnumbered) question.
    if (current === null || current.choices.length > 0) push()
    const block: Block = current ?? newBlock()
    current = block
    block.stemLines.push(line.trim())
  }
  push()

  const usable = blocks.filter((b) => b.choices.length > 0)
  return usable.map((block, i) => finish(block, keyAnswers.get(i + 1) ?? null))
}

function finish(block: Block, keyAnswer: number | null): ParsedQuestion {
  const issues: string[] = []
  let stem = block.stemLines.join(' ').replace(/\s+/g, ' ').trim()
  let choices = block.choices.map((c) => c.replace(/\s+/g, ' ').trim())

  let correct: number | null = block.marked[0] ?? null
  if (block.marked.length > 1) issues.push('More than one choice is marked correct; the first one was kept')
  if (correct === null && block.answerLine !== null) correct = block.answerLine
  if (correct === null && keyAnswer !== null) correct = keyAnswer
  if (correct === null && block.boldChoices.length === 1) correct = block.boldChoices[0] ?? null
  if (correct !== null && correct >= choices.length) {
    issues.push('The marked answer is not one of the choices')
    correct = null
  }
  if (correct === null) issues.push('No correct answer marked; pick one')

  if (choices.length > MAX_CHOICES) {
    issues.push(`${choices.length} choices found; only the first ${MAX_CHOICES} were kept`)
    choices = choices.slice(0, MAX_CHOICES)
    if (correct !== null && correct >= MAX_CHOICES) {
      correct = null
      issues.push('The correct answer was among the dropped choices; pick one')
    }
  }
  if (choices.length < MIN_CHOICES) issues.push(`Only ${choices.length} choice found; a question needs at least ${MIN_CHOICES}`)
  if (choices.some((c) => c === '')) issues.push('A choice is blank')
  if (stem === '') issues.push('The question text is blank')
  if (stem.length > MAX_STEM_CHARS) {
    stem = stem.slice(0, MAX_STEM_CHARS)
    issues.push(`Question text was cut to ${MAX_STEM_CHARS} characters`)
  }
  choices = choices.map((c, i) => {
    if (c.length <= MAX_CHOICE_CHARS) return c
    issues.push(`Choice ${CHOICE_LETTERS[i] ?? i + 1} was cut to ${MAX_CHOICE_CHARS} characters`)
    return c.slice(0, MAX_CHOICE_CHARS)
  })
  const bad = unsupportedChars(stem + choices.join(''))
  if (bad.length > 0) issues.push(`Unsupported characters: ${bad.join(' ')}`)

  return { stem, choices, correctChoice: correct, issues }
}

// ---------------------------------------------------------------------------
// JSON (some assistants answer with it even when asked for text)

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

function extractJson(text: string): unknown {
  const cleaned = cleanLines(text).join('\n')
  const start = cleaned.search(/[[{]/)
  if (start < 0) return null
  const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'))
  if (end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

function jsonQuestions(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && 'questions' in value && Array.isArray(value.questions)) return value.questions
  return null
}

function jsonChoices(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object') {
          const o = c as Record<string, unknown>
          return asString(o['text']) ?? asString(o['choice']) ?? asString(o['label']) ?? ''
        }
        return ''
      })
      .map((c) => c.trim())
  }
  if (raw && typeof raw === 'object') {
    // { "A": "...", "B": "..." }
    return Object.entries(raw as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => (asString(v) ?? '').trim())
  }
  return []
}

function jsonCorrect(o: Record<string, unknown>, choices: string[]): number | null {
  const raw = o['answer'] ?? o['correct'] ?? o['correctChoice'] ?? o['correct_answer'] ?? o['correctAnswer'] ?? o['correctIndex'] ?? o['key']
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    // 0-based when in range; a value equal to the choice count can only be 1-based.
    if (raw >= 0 && raw < choices.length) return raw
    if (raw === choices.length) return raw - 1
    return null
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (/^[A-Ea-e]$/.test(s)) return letterIndex(s)
    const byText = choices.findIndex((c) => c.toLowerCase() === s.toLowerCase())
    if (byText >= 0) return byText
  }
  return null
}

function parseJson(text: string): ParsedQuestion[] | null {
  const list = jsonQuestions(extractJson(text))
  if (!list) return null
  const questions: ParsedQuestion[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const stem = asString(o['question']) ?? asString(o['stem']) ?? asString(o['text']) ?? asString(o['prompt']) ?? ''
    const choices = jsonChoices(o['choices'] ?? o['options'] ?? o['answers'])
    if (choices.length === 0) continue
    const block: Block = { stemLines: [stem], choices, marked: [], boldChoices: [], answerLine: jsonCorrect(o, choices) }
    questions.push(finish(block, null))
  }
  return questions.length > 0 ? questions : null
}

/** Parse an assistant's reply (or any pasted quiz) into questions. Never throws. */
export function parseQuestions(text: string): QuestionImportResult {
  if (text.trim() === '') return { questions: [], error: null }
  const questions = parseJson(text) ?? parseText(text)
  if (questions.length === 0) {
    return {
      questions: [],
      error: 'No questions found. Each question needs its choices on separate lines, labeled A), B), C)...'
    }
  }
  return { questions, error: null }
}
