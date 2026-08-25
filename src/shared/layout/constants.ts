/**
 * Sheet geometry in PDF points (72 per inch) on US Letter, 612 x 792.
 * Matches docs/ARCHITECTURE.md section 5.1. The grader multiplies by 2 to
 * get canonical pixels. Bump LAYOUT_CONSTANTS_VERSION whenever any value
 * that affects printed geometry changes.
 */

export const LAYOUT_CONSTANTS_VERSION = 1

export const PAGE_WIDTH = 612
export const PAGE_HEIGHT = 792

/** Hard content caps. The fit check is the real guard; these bound the inputs. */
export const MAX_QUESTIONS = 10
export const MIN_QUESTIONS = 1
export const MAX_CHOICES = 5
export const MIN_CHOICES = 2
export const MAX_STEM_CHARS = 240
export const MAX_CHOICE_CHARS = 80
export const MAX_TITLE_CHARS = 60
export const MAX_INSTRUCTIONS_CHARS = 120

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

/** Registration marks: three squares and one circle (bottom right) for orientation. */
export const REG_MARK_SIZE = 20
export const REG_MARK_CENTERS = {
  topLeft: [35, 35],
  topRight: [577, 35],
  bottomLeft: [35, 757],
  bottomRight: [577, 757]
} as const

/** Header region. */
export const HEADER_TOP = 55
export const HEADER_BOTTOM = 175
export const TITLE_X = 50
export const TITLE_WIDTH = 428
export const TITLE_FONT_SIZE = 14
export const TITLE_MAX_LINES = 2
export const TITLE_BASELINE_Y = 74
export const META_FONT_SIZE = 9
export const META_BASELINE_Y = 108
export const QR_SIZE = 90
export const QR_X = 487
export const QR_Y = 60
export const QR_CODE_TEXT_Y = 152
export const QR_CODE_FONT_SIZE = 8
export const NAME_BOX = [50, 118, 380, 150] as const
export const SECTION_BOX = [392, 118, 478, 150] as const
export const BOX_LABEL_FONT_SIZE = 7

/** Instructions: up to two lines left of the A-E strip header. */
export const INSTRUCTIONS_X = 50
export const INSTRUCTIONS_WIDTH = 385
export const INSTRUCTIONS_FONT_SIZE = 8.5
export const INSTRUCTIONS_MAX_LINES = 2
export const INSTRUCTIONS_BASELINE_Y = 183
export const STRIP_HEADER_Y = 188
export const STRIP_HEADER_FONT_SIZE = 9

/** Question grid. */
export const GRID_TOP = 200
export const GRID_BOTTOM = 745
export const GRID_HEIGHT = GRID_BOTTOM - GRID_TOP
export const TEXT_COL_X = 50
export const TEXT_COL_WIDTH = 380
export const SLOT_PADDING = 6
export const NUMBER_GUTTER = 22
export const CHOICE_LABEL_GUTTER = 16
export const CHOICE_COLUMN_GAP = 6
export const STEM_CHOICE_GAP = 2
/** Subtracted from every measured width so rounding can never push a line past its box. */
export const WIDTH_TOLERANCE = 1

/** Bubble strip. Bubble x centers depend only on the choice index, y only on the slot. */
export const BUBBLE_STRIP_X = 445
export const BUBBLE_STRIP_RIGHT = 575
export const BUBBLE_RADIUS = 8
export const BUBBLE_SPACING = 24
export const BUBBLE_X = [455, 479, 503, 527, 551] as const
export const BUBBLE_Y_OFFSET = 14

export function baseFontSize(questionCount: number): number {
  return questionCount <= 7 ? 11 : 10
}

export function slotHeightFor(questionCount: number): number {
  return Math.floor(GRID_HEIGHT / questionCount)
}
