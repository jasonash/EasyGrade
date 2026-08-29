import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import type { LabelStyle, Student, Test } from '@shared/types'
import { formatQrPayload } from '@shared/codes'
import {
  AS_COLUMN_GAP,
  AS_GRID_LEFT,
  AS_GRID_TOP,
  AS_NUMBER_FONT_SIZE,
  AS_NUMBER_GUTTER,
  BOX_LABEL_FONT_SIZE,
  BUBBLE_RADIUS,
  BUBBLE_X,
  BUBBLE_Y_OFFSET,
  CHOICE_COLUMN_GAP,
  CHOICE_LABEL_GUTTER,
  GRID_BOTTOM,
  GRID_RIGHT,
  GRID_TOP,
  INSTRUCTIONS_BASELINE_Y,
  INSTRUCTIONS_FONT_SIZE,
  INSTRUCTIONS_X,
  META_BASELINE_Y,
  META_FONT_SIZE,
  NAME_BOX,
  NUMBER_GUTTER,
  PAGE_HEIGHT,
  QR_CODE_FONT_SIZE,
  QR_CODE_TEXT_Y,
  QR_SIZE,
  QR_X,
  QR_Y,
  REG_MARK_CENTERS,
  REG_MARK_SIZE,
  SECTION_BOX,
  SLOT_PADDING,
  STEM_CHOICE_GAP,
  STEM_WIDTH,
  BUBBLE_LABEL_FONT_SIZE,
  BUBBLE_LABEL_GRAY,
  TEXT_COL_X,
  TITLE_BASELINE_Y,
  TITLE_FONT_SIZE,
  TITLE_X,
  bubbleCenter,
  choiceLabel,
  layoutKind,
  lineHeight,
  measureHeader,
  measureTest,
  type HeaderMeasure,
  type SheetLayout,
  type TestMeasure
} from '@shared/layout'
import { AppError } from './errors'

/**
 * Draws answer sheets with pdfkit at the exact coordinates the editor's SVG
 * preview uses. Every string is drawn as one pre-wrapped line with
 * `lineBreak: false`, so pdfkit never wraps, never moves its cursor into the
 * next slot, and never adds a page on its own. After each sheet the page
 * count is asserted; a mismatch is a bug, not something to paginate around.
 */

/** Helvetica ascender as a fraction of the font size; matches the preview's ASCENT. */
const ASCENT = 0.718
const INK = '#000000'
const MUTED = '#666666'
const RULE = '#999999'

const FONT = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const FONT_ITALIC = 'Helvetica-Oblique'
const FONT_MONO = 'Courier'

/** Blank line printed after "Date:" when no date label was given. */
export const DATE_BLANK = '____________'

export interface SheetSpec {
  /** Null prints a blank sheet with name and section boxes. */
  student: Student | null
}

export interface PdfJob {
  test: Test
  layout: SheetLayout
  students: Student[]
  blankCount: number
  dateLabel: string | null
}

export interface PdfResult {
  buffer: Buffer
  pageCount: number
}

export interface PdfServiceOptions {
  /** Leave content streams uncompressed (tests look inside them). */
  compress?: boolean
}

type Doc = PDFKit.PDFDocument
const NO_WRAP: PDFKit.Mixins.TextOptions = { lineBreak: false, baseline: 'alphabetic' }

export class PdfService {
  constructor(private readonly options: PdfServiceOptions = {}) {}

  /** Personalized sheets first (in the order given), then blanks. */
  async render(job: PdfJob): Promise<PdfResult> {
    const sheets: SheetSpec[] = [
      ...job.students.map((student) => ({ student })),
      ...Array.from({ length: job.blankCount }, () => ({ student: null }))
    ]
    if (sheets.length === 0) throw new AppError('VALIDATION', 'Nothing to print: choose students or blank copies')

    const answerSheet = layoutKind(job.layout) === 'answer_sheet'
    let measure: HeaderMeasure | TestMeasure
    if (answerSheet) {
      measure = measureHeader(job.test.title, job.test.instructions)
      if (measure.problems.length > 0) {
        throw new AppError('CONFLICT', `The header no longer fits. ${measure.problems.join('. ')}`)
      }
      if (job.layout.cells?.length !== job.test.questions.length) {
        throw new AppError('CONFLICT', 'The stored layout does not match the questions. Finalize the test again.')
      }
    } else {
      const full = measureTest({
        title: job.test.title,
        instructions: job.test.instructions,
        questions: job.test.questions.map((q) => ({ stem: q.stem, choices: q.choices }))
      })
      if (!full.fits) {
        const bad = full.questions.find((q) => !q.fits)
        const detail = bad ? `Question ${bad.index + 1}: ${bad.problems.join('; ')}` : full.problems.join('. ')
        throw new AppError('CONFLICT', `The test no longer fits on one page. ${detail}`)
      }
      measure = full
    }
    if (job.layout.questionCount !== job.test.questions.length) {
      throw new AppError('CONFLICT', 'The stored layout does not match the questions. Finalize the test again.')
    }

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 0,
      autoFirstPage: false,
      bufferPages: true,
      compress: this.options.compress ?? true,
      info: { Title: job.test.title, Creator: 'EasyGrade' }
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
    })

    sheets.forEach((sheet, index) => {
      doc.addPage()
      drawSheet(doc, job, measure, sheet)
      const pages = doc.bufferedPageRange().count
      if (pages !== index + 1) {
        doc.end()
        throw new AppError(
          'INTERNAL',
          `Sheet ${index + 1} produced ${pages - index} pages instead of one; the layout engine and the PDF drawing disagree`
        )
      }
    })

    doc.end()
    const buffer = await done
    return { buffer, pageCount: sheets.length }
  }
}

function drawSheet(doc: Doc, job: PdfJob, measure: HeaderMeasure | TestMeasure, sheet: SheetSpec): void {
  const { test, layout } = job
  drawRegistrationMarks(doc)
  drawHeader(doc, job, measure, sheet)
  drawQr(doc, formatQrPayload({ testCode: test.code, studentCode: sheet.student?.code ?? null, layoutVersion: test.layoutVersion }))
  drawInstructions(doc, measure)
  drawGridTopRule(doc)
  if ('questions' in measure) drawGrid(doc, layout, measure)
  else drawAnswerGrid(doc, layout, test)
}

function drawRegistrationMarks(doc: Doc): void {
  const half = REG_MARK_SIZE / 2
  for (const key of ['topLeft', 'topRight', 'bottomLeft'] as const) {
    const [cx, cy] = REG_MARK_CENTERS[key]
    doc.rect(cx - half, cy - half, REG_MARK_SIZE, REG_MARK_SIZE).fill(INK)
  }
  const [cx, cy] = REG_MARK_CENTERS.bottomRight
  doc.circle(cx, cy, half).fill(INK)
}

function drawHeader(doc: Doc, job: PdfJob, measure: HeaderMeasure, sheet: SheetSpec): void {
  const { test, dateLabel } = job
  doc.fillColor(INK).font(FONT_BOLD).fontSize(TITLE_FONT_SIZE)
  measure.titleLines.forEach((line, i) => {
    doc.text(line, TITLE_X, TITLE_BASELINE_Y + i * lineHeight(TITLE_FONT_SIZE), NO_WRAP)
  })

  doc.font(FONT).fontSize(META_FONT_SIZE)
  doc.text(test.sectionName, TITLE_X, META_BASELINE_Y, NO_WRAP)
  doc.text(`Date: ${dateLabel ?? DATE_BLANK}`, TITLE_X + 250, META_BASELINE_Y, NO_WRAP)

  if (sheet.student) {
    const name = `${sheet.student.lastName}, ${sheet.student.firstName}`
    const [x, top] = NAME_BOX
    doc.font(FONT_BOLD).fontSize(12).text(name, x, top + 8 + 12 * ASCENT, NO_WRAP)
    if (sheet.student.studentNumber) {
      doc.font(FONT).fontSize(META_FONT_SIZE).fillColor(MUTED)
      doc.text(sheet.student.studentNumber, SECTION_BOX[0], top + 8 + 12 * ASCENT, NO_WRAP)
      doc.fillColor(INK)
    }
    return
  }

  for (const { box, label } of [
    { box: NAME_BOX, label: 'Name' },
    { box: SECTION_BOX, label: 'Section' }
  ]) {
    const [x1, y1, x2, y2] = box
    doc.lineWidth(0.75).rect(x1, y1, x2 - x1, y2 - y1).stroke(INK)
    doc.font(FONT).fontSize(BOX_LABEL_FONT_SIZE).fillColor(MUTED)
    doc.text(label, x1 + 3, y1 + BOX_LABEL_FONT_SIZE + 2, NO_WRAP)
    doc.fillColor(INK)
  }
}

/** Vector QR: horizontal runs of dark modules merged into single rectangles so viewers show no seams. */
function drawQr(doc: Doc, payload: string): void {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' })
  const size = qr.modules.size
  const data = qr.modules.data
  const unit = QR_SIZE / size
  doc.fillColor(INK)
  for (let row = 0; row < size; row++) {
    let col = 0
    while (col < size) {
      if (!data[row * size + col]) {
        col++
        continue
      }
      let end = col
      while (end < size && data[row * size + end]) end++
      doc.rect(QR_X + col * unit, QR_Y + row * unit, (end - col) * unit, unit).fill(INK)
      col = end
    }
  }

  doc.font(FONT_MONO).fontSize(QR_CODE_FONT_SIZE)
  const width = doc.widthOfString(payload)
  doc.text(payload, QR_X + (QR_SIZE - width) / 2, QR_CODE_TEXT_Y + QR_CODE_FONT_SIZE * ASCENT, NO_WRAP)
}

function drawInstructions(doc: Doc, measure: HeaderMeasure): void {
  doc.fillColor(INK).font(FONT_ITALIC).fontSize(INSTRUCTIONS_FONT_SIZE)
  measure.instructionLines.forEach((line, i) => {
    doc.text(line, INSTRUCTIONS_X, INSTRUCTIONS_BASELINE_Y + i * lineHeight(INSTRUCTIONS_FONT_SIZE), NO_WRAP)
  })
}

function drawGridTopRule(doc: Doc): void {
  doc.lineWidth(0.5).moveTo(TEXT_COL_X, GRID_TOP).lineTo(GRID_RIGHT, GRID_TOP).stroke(INK)
}

/** The choice label centered inside each bubble (capital centered on the bubble middle). */
function drawBubbleLetters(doc: Doc, xs: number[], rowY: number, labelStyle: LabelStyle): void {
  doc.fillColor(BUBBLE_LABEL_GRAY).font(FONT).fontSize(BUBBLE_LABEL_FONT_SIZE)
  const baseline = rowY + (BUBBLE_LABEL_FONT_SIZE * ASCENT) / 2
  xs.forEach((bx, c) => {
    const letter = choiceLabel(c, labelStyle)
    doc.text(letter, bx - doc.widthOfString(letter) / 2, baseline, NO_WRAP)
  })
  doc.fillColor(INK)
}

/**
 * Answer-sheet-only grid: numbered rows of bubbles down each column, a
 * light rule every five rows, a divider between columns. Geometry comes
 * entirely from the layout cells so the grader reads the same positions.
 */
function drawAnswerGrid(doc: Doc, layout: SheetLayout, test: Test): void {
  const cells = layout.cells ?? []
  cells.forEach((cell, i) => {
    const count = layout.choiceCounts[i] ?? 0
    const labelStyle = test.questions[i]?.labelStyle ?? 'letters'
    doc.fillColor(INK).font(FONT_BOLD).fontSize(AS_NUMBER_FONT_SIZE)
    const num = `${i + 1}.`
    doc.text(num, cell.left + AS_NUMBER_GUTTER - 6 - doc.widthOfString(num), cell.y + (AS_NUMBER_FONT_SIZE * ASCENT) / 2, NO_WRAP)
    const xs: number[] = []
    doc.lineWidth(0.75)
    for (let c = 0; c < count; c++) {
      const center = bubbleCenter(layout, i, c)
      if (!center) throw new AppError('INTERNAL', `Question ${i + 1} has no bubble ${c + 1} in the layout`)
      doc.circle(center[0], center[1], layout.bubbleRadius || BUBBLE_RADIUS).stroke(INK)
      xs.push(center[0])
    }
    drawBubbleLetters(doc, xs, cell.y, labelStyle)
    const next = cells[i + 1]
    if (cell.row % 5 === 4 && next && next.column === cell.column) {
      const y = cell.top + cell.height
      doc.lineWidth(0.25).moveTo(cell.left, y).lineTo(cell.left + cell.width, y).stroke(RULE)
    }
  })
  const columns = cells.reduce((max, cell) => Math.max(max, cell.column), -1) + 1
  const columnWidth = cells[0]?.width ?? 0
  for (let col = 1; col < columns; col++) {
    const x = AS_GRID_LEFT + col * (columnWidth + AS_COLUMN_GAP) - AS_COLUMN_GAP / 2
    doc.lineWidth(0.25).moveTo(x, AS_GRID_TOP).lineTo(x, GRID_BOTTOM).stroke(RULE)
  }
}

function drawGrid(doc: Doc, layout: SheetLayout, measure: TestMeasure): void {
  const { fontSize, slotHeight } = measure
  const lh = lineHeight(fontSize)
  const stemX = TEXT_COL_X + NUMBER_GUTTER

  measure.questions.forEach((q, i) => {
    const top = layout.slotTop[i] ?? GRID_TOP + i * slotHeight
    const bottom = top + slotHeight
    if (bottom > PAGE_HEIGHT) throw new AppError('INTERNAL', `Question ${i + 1} slot extends past the page`)
    const columns = q.columns
    const cellWidth = (STEM_WIDTH - CHOICE_COLUMN_GAP * (columns - 1)) / columns
    const firstBaseline = top + SLOT_PADDING + fontSize * ASCENT
    const stemRows = Math.max(1, q.stemLines.length)
    const choiceTop = firstBaseline + stemRows * lh + STEM_CHOICE_GAP

    doc.fillColor(INK).font(FONT_BOLD).fontSize(fontSize)
    doc.text(`${i + 1}.`, TEXT_COL_X, firstBaseline, NO_WRAP)
    doc.font(FONT)
    q.stemLines.forEach((line, k) => doc.text(line, stemX, firstBaseline + k * lh, NO_WRAP))

    for (const cell of q.choiceCells) {
      const x = stemX + cell.column * (cellWidth + CHOICE_COLUMN_GAP)
      const y = choiceTop + cell.row * lh
      doc.text(`${cell.letter}.`, x, y, NO_WRAP)
      cell.lines.forEach((line, k) => doc.text(line, x + CHOICE_LABEL_GUTTER, y + k * lh, NO_WRAP))
    }

    const rowY = layout.rowY[i] ?? top + BUBBLE_Y_OFFSET
    const count = layout.choiceCounts[i] ?? 0
    doc.lineWidth(0.75)
    for (let c = 0; c < count; c++) {
      const bx = layout.bubbleX[c] ?? BUBBLE_X[c] ?? 0
      doc.circle(bx, rowY, layout.bubbleRadius || BUBBLE_RADIUS).stroke(INK)
    }
    drawBubbleLetters(doc, Array.from({ length: count }, (_, c) => layout.bubbleX[c] ?? BUBBLE_X[c] ?? 0), rowY, 'letters')
    doc.lineWidth(0.25).moveTo(TEXT_COL_X, bottom).lineTo(GRID_RIGHT, bottom).stroke(RULE)
  })
}
