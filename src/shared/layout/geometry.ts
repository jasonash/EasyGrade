import {
  AS_BUBBLE_PITCH,
  AS_COLUMN_GAP,
  AS_GRID_LEFT,
  AS_GRID_RIGHT,
  AS_GRID_TOP,
  AS_MAX_COLUMNS,
  AS_NUMBER_FONT_SIZE,
  AS_NUMBER_GUTTER,
  AS_ROWS_PER_COLUMN,
  AS_ROW_PITCH,
  BOX_LABEL_FONT_SIZE,
  BUBBLE_RADIUS,
  BUBBLE_X,
  BUBBLE_Y_OFFSET,
  GRID_TOP,
  LAYOUT_CONSTANTS_VERSION,
  MAX_BUBBLES,
  MAX_CHOICES,
  MAX_QUESTIONS,
  MIN_BUBBLES,
  MIN_CHOICES,
  MIN_QUESTIONS,
  NAME_BOX,
  SECTION_BOX,
  baseFontSize,
  slotHeightFor
} from './constants'

export type SheetKind = 'standard' | 'answer_sheet'

/** One question's cell in the answer-sheet grid, in PDF points. */
export interface AnswerCell {
  column: number
  row: number
  left: number
  top: number
  width: number
  height: number
  /** Bubble center y. */
  y: number
  /** Bubble center x per choice. */
  x: number[]
}

/**
 * Everything the printer and the grader need to agree on, resolved for one
 * test. Serialized to tests.layout_json at finalize time (DATA_MODEL 4.1).
 * Standard layouts put every bubble in one strip (bubbleX by choice, rowY by
 * question). Answer-sheet layouts add per-question cells; read bubble
 * positions through bubbleCenter() so both kinds work.
 */
export interface SheetLayout {
  constantsVersion: number
  /** Missing in layouts stored before answer sheets existed; treat as standard. */
  kind?: SheetKind
  questionCount: number
  fontSize: number
  slotHeight: number
  /** Number of choices per question, in order. */
  choiceCounts: number[]
  /** Bubble center x for choices A..E (standard layouts; empty for answer sheets). */
  bubbleX: number[]
  /** Bubble center y per question. */
  rowY: number[]
  /** Top edge of each question slot. */
  slotTop: number[]
  bubbleRadius: number
  nameBox: [number, number, number, number]
  sectionBox: [number, number, number, number]
  /** Answer sheets only. */
  columns?: number
  rowPitch?: number
  cells?: AnswerCell[]
}

export function buildSheetLayout(choiceCounts: number[]): SheetLayout {
  const questionCount = choiceCounts.length
  if (questionCount < MIN_QUESTIONS || questionCount > MAX_QUESTIONS) {
    throw new RangeError(`Question count ${questionCount} is outside ${MIN_QUESTIONS}..${MAX_QUESTIONS}`)
  }
  for (const count of choiceCounts) {
    if (count < MIN_CHOICES || count > MAX_CHOICES) {
      throw new RangeError(`Choice count ${count} is outside ${MIN_CHOICES}..${MAX_CHOICES}`)
    }
  }
  const slotHeight = slotHeightFor(questionCount)
  const slotTop = choiceCounts.map((_, i) => GRID_TOP + i * slotHeight)
  return {
    constantsVersion: LAYOUT_CONSTANTS_VERSION,
    kind: 'standard',
    questionCount,
    fontSize: baseFontSize(questionCount),
    slotHeight,
    choiceCounts: [...choiceCounts],
    bubbleX: [...BUBBLE_X],
    rowY: slotTop.map((top) => top + BUBBLE_Y_OFFSET),
    slotTop,
    bubbleRadius: BUBBLE_RADIUS,
    nameBox: [...NAME_BOX],
    sectionBox: [...SECTION_BOX]
  }
}

export interface AnswerSheetCapacity {
  columns: number
  rowsPerColumn: number
  columnWidth: number
  /** Most questions that fit on one page at this default bubble count. */
  capacity: number
}

/** How many questions fit when every column is sized for `defaultCount` bubbles. */
export function answerSheetCapacity(defaultCount: number): AnswerSheetCapacity {
  if (!Number.isInteger(defaultCount) || defaultCount < MIN_BUBBLES || defaultCount > MAX_BUBBLES) {
    throw new RangeError(`Bubble count ${defaultCount} is outside ${MIN_BUBBLES}..${MAX_BUBBLES}`)
  }
  const columnWidth = AS_NUMBER_GUTTER + defaultCount * AS_BUBBLE_PITCH
  const fit = Math.floor((AS_GRID_RIGHT - AS_GRID_LEFT + AS_COLUMN_GAP) / (columnWidth + AS_COLUMN_GAP))
  const columns = Math.max(1, Math.min(AS_MAX_COLUMNS, fit))
  return { columns, rowsPerColumn: AS_ROWS_PER_COLUMN, columnWidth, capacity: columns * AS_ROWS_PER_COLUMN }
}

/**
 * Layout for an answer-sheet-only test. Every column is `defaultCount`
 * bubbles wide; a question may use fewer bubbles, never more.
 */
export function buildAnswerSheetLayout(choiceCounts: number[], defaultCount: number): SheetLayout {
  const { columns, rowsPerColumn, columnWidth, capacity } = answerSheetCapacity(defaultCount)
  const questionCount = choiceCounts.length
  if (questionCount < MIN_QUESTIONS) throw new RangeError('An answer sheet needs at least one question')
  if (questionCount > capacity) {
    throw new RangeError(`${questionCount} questions do not fit; at most ${capacity} fit with ${defaultCount} bubbles`)
  }
  choiceCounts.forEach((count, i) => {
    if (!Number.isInteger(count) || count < MIN_BUBBLES || count > defaultCount) {
      throw new RangeError(`Question ${i + 1} has ${count} bubbles; allowed ${MIN_BUBBLES}..${defaultCount}`)
    }
  })
  const cells: AnswerCell[] = choiceCounts.map((count, i) => {
    const column = Math.floor(i / rowsPerColumn)
    const row = i % rowsPerColumn
    const left = AS_GRID_LEFT + column * (columnWidth + AS_COLUMN_GAP)
    const top = AS_GRID_TOP + row * AS_ROW_PITCH
    const y = top + AS_ROW_PITCH / 2
    const x = Array.from({ length: count }, (_, c) => left + AS_NUMBER_GUTTER + BUBBLE_RADIUS + c * AS_BUBBLE_PITCH)
    return { column, row, left, top, width: columnWidth, height: AS_ROW_PITCH, y, x }
  })
  return {
    constantsVersion: LAYOUT_CONSTANTS_VERSION,
    kind: 'answer_sheet',
    questionCount,
    fontSize: AS_NUMBER_FONT_SIZE,
    slotHeight: AS_ROW_PITCH,
    choiceCounts: [...choiceCounts],
    bubbleX: [],
    rowY: cells.map((cell) => cell.y),
    slotTop: cells.map((cell) => cell.top),
    bubbleRadius: BUBBLE_RADIUS,
    nameBox: [...NAME_BOX],
    sectionBox: [...SECTION_BOX],
    columns,
    rowPitch: AS_ROW_PITCH,
    cells
  }
}

export function layoutKind(layout: SheetLayout): SheetKind {
  return layout.kind ?? 'standard'
}

/** Bubble center for question q, choice c, in PDF points; null when the layout has no such bubble. */
export function bubbleCenter(layout: SheetLayout, q: number, c: number): [number, number] | null {
  const count = layout.choiceCounts[q]
  if (count === undefined || c < 0 || c >= count) return null
  const cell = layout.cells?.[q]
  if (cell) {
    const x = cell.x[c]
    return x === undefined ? null : [x, cell.y]
  }
  const x = layout.bubbleX[c]
  const y = layout.rowY[q]
  return x === undefined || y === undefined ? null : [x, y]
}

/** The rectangle a question occupies (its grid slot or its answer-sheet cell): [left, top, width, height]. */
export function questionBox(layout: SheetLayout, q: number, standardLeft: number, standardRight: number): [number, number, number, number] | null {
  const cell = layout.cells?.[q]
  if (cell) return [cell.left, cell.top, cell.width, cell.height]
  const top = layout.slotTop[q]
  if (top === undefined) return null
  return [standardLeft, top, standardRight - standardLeft, layout.slotHeight]
}

export { BOX_LABEL_FONT_SIZE }
