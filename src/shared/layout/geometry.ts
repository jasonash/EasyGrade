import {
  BOX_LABEL_FONT_SIZE,
  BUBBLE_RADIUS,
  BUBBLE_X,
  BUBBLE_Y_OFFSET,
  GRID_TOP,
  LAYOUT_CONSTANTS_VERSION,
  MAX_CHOICES,
  MAX_QUESTIONS,
  MIN_CHOICES,
  MIN_QUESTIONS,
  NAME_BOX,
  SECTION_BOX,
  baseFontSize,
  slotHeightFor
} from './constants'

/**
 * Everything the printer and the grader need to agree on, resolved for one
 * test. Serialized to tests.layout_json at finalize time (DATA_MODEL 4.1).
 */
export interface SheetLayout {
  constantsVersion: number
  questionCount: number
  fontSize: number
  slotHeight: number
  /** Number of choices per question, in order. */
  choiceCounts: number[]
  /** Bubble center x for choices A..E. */
  bubbleX: number[]
  /** Bubble center y per question. */
  rowY: number[]
  /** Top edge of each question slot. */
  slotTop: number[]
  bubbleRadius: number
  nameBox: [number, number, number, number]
  sectionBox: [number, number, number, number]
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

export { BOX_LABEL_FONT_SIZE }
