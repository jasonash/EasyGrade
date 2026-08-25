import {
  CHOICE_COLUMN_GAP,
  CHOICE_LABEL_GUTTER,
  CHOICE_LETTERS,
  INSTRUCTIONS_FONT_SIZE,
  INSTRUCTIONS_MAX_LINES,
  INSTRUCTIONS_WIDTH,
  MAX_QUESTIONS,
  NUMBER_GUTTER,
  SLOT_PADDING,
  STEM_CHOICE_GAP,
  TEXT_COL_WIDTH,
  TITLE_FONT_SIZE,
  TITLE_MAX_LINES,
  TITLE_WIDTH,
  WIDTH_TOLERANCE,
  baseFontSize,
  slotHeightFor
} from './constants'
import { lineHeight, textWidth, unsupportedChars, wrapText } from './text'

/** The minimum a question needs to be measured. Ids and keys are irrelevant to fit. */
export interface MeasurableQuestion {
  stem: string
  choices: string[]
}

export interface MeasurableTest {
  title: string
  instructions: string
  questions: MeasurableQuestion[]
}

/** Wrapped text plus where it goes, so the preview and the PDF draw identical lines. */
export interface ChoiceCell {
  letter: string
  lines: string[]
  column: number
  row: number
}

export interface QuestionMeasure {
  index: number
  slotHeight: number
  requiredHeight: number
  fits: boolean
  /** requiredHeight / slotHeight; above 1 means overflow. */
  usage: number
  stemLines: string[]
  columns: number
  /** Width available to each choice's text. */
  choiceTextWidth: number
  choiceCells: ChoiceCell[]
  /** Total text rows consumed by the choice grid. */
  choiceRows: number
  problems: string[]
}

export interface TestMeasure {
  fits: boolean
  fontSize: number
  slotHeight: number
  /** Worst question usage, or 0 without questions. */
  usage: number
  titleLines: string[]
  instructionLines: string[]
  questions: QuestionMeasure[]
  /** Test-level problems (title, instructions, question count, unsupported characters). */
  problems: string[]
}

export const STEM_WIDTH = TEXT_COL_WIDTH - NUMBER_GUTTER - WIDTH_TOLERANCE

export function measureQuestion(question: MeasurableQuestion, index: number, questionCount: number): QuestionMeasure {
  const fontSize = baseFontSize(questionCount)
  const slotHeight = slotHeightFor(questionCount)
  const lh = lineHeight(fontSize)
  const problems: string[] = []

  const stemLines = wrapText(question.stem, STEM_WIDTH, fontSize)

  // Pick the column count from the widest choice text.
  const widest = Math.max(0, ...question.choices.map((c) => textWidth(c.replace(/\s+/g, ' ').trim(), fontSize)))
  const columns = pickColumns(widest, question.choices.length)
  const choiceTextWidth = cellTextWidth(columns)

  const choiceCells: ChoiceCell[] = []
  let choiceRows = 0
  if (columns === 1) {
    question.choices.forEach((choice, i) => {
      const lines = wrapText(choice, choiceTextWidth, fontSize)
      choiceCells.push({ letter: CHOICE_LETTERS[i] ?? '?', lines, column: 0, row: choiceRows })
      choiceRows += Math.max(1, lines.length)
    })
  } else {
    question.choices.forEach((choice, i) => {
      const lines = wrapText(choice, choiceTextWidth, fontSize)
      choiceCells.push({
        letter: CHOICE_LETTERS[i] ?? '?',
        lines,
        column: i % columns,
        row: Math.floor(i / columns)
      })
    })
    choiceRows = Math.ceil(question.choices.length / columns)
  }

  const textRows = Math.max(1, stemLines.length) + choiceRows
  const requiredHeight = SLOT_PADDING * 2 + textRows * lh + STEM_CHOICE_GAP
  const overflow = requiredHeight > slotHeight
  if (overflow) {
    const extraLines = Math.ceil((requiredHeight - slotHeight) / lh)
    problems.push(`Too long by ${extraLines} ${extraLines === 1 ? 'line' : 'lines'}`)
  }
  const bad = unsupportedChars(question.stem + question.choices.join(''))
  if (bad.length > 0) problems.push(`Unsupported characters: ${bad.join(' ')}`)

  return {
    index,
    slotHeight,
    requiredHeight,
    fits: problems.length === 0,
    usage: requiredHeight / slotHeight,
    stemLines,
    columns,
    choiceTextWidth,
    choiceCells,
    choiceRows,
    problems
  }
}

export function measureTest(test: MeasurableTest): TestMeasure {
  const questionCount = test.questions.length
  const problems: string[] = []

  const titleLines = wrapText(test.title, TITLE_WIDTH - WIDTH_TOLERANCE, TITLE_FONT_SIZE, 'bold')
  if (titleLines.length > TITLE_MAX_LINES) problems.push('Title is too long to fit the header')
  const instructionLines = wrapText(test.instructions, INSTRUCTIONS_WIDTH - WIDTH_TOLERANCE, INSTRUCTIONS_FONT_SIZE)
  if (instructionLines.length > INSTRUCTIONS_MAX_LINES) problems.push('Instructions are too long to fit above the grid')
  const badHeader = unsupportedChars(test.title + test.instructions)
  if (badHeader.length > 0) problems.push(`Unsupported characters in the header: ${badHeader.join(' ')}`)

  if (questionCount === 0) problems.push('Add at least one question')
  if (questionCount > MAX_QUESTIONS) problems.push(`At most ${MAX_QUESTIONS} questions fit on one page`)

  const count = Math.max(1, Math.min(questionCount, MAX_QUESTIONS))
  const questions = test.questions.map((q, i) => measureQuestion(q, i, count))
  const usage = questions.reduce((max, q) => Math.max(max, q.usage), 0)

  return {
    fits: problems.length === 0 && questions.every((q) => q.fits),
    fontSize: baseFontSize(count),
    slotHeight: slotHeightFor(count),
    usage,
    titleLines,
    instructionLines,
    questions,
    problems
  }
}

/** Width of the text area inside one choice cell for a given column count. */
export function cellTextWidth(columns: number): number {
  const cellWidth = (STEM_WIDTH - CHOICE_COLUMN_GAP * (columns - 1)) / columns
  return cellWidth - CHOICE_LABEL_GUTTER
}

function pickColumns(widestChoice: number, choiceCount: number): number {
  if (choiceCount <= 1) return 1
  const tried = new Set<number>()
  for (const candidate of [4, 2]) {
    const columns = Math.min(candidate, choiceCount)
    if (tried.has(columns)) continue
    tried.add(columns)
    if (widestChoice <= cellTextWidth(columns)) return columns
  }
  return 1
}
