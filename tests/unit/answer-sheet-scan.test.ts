import { beforeAll, describe, expect, it } from 'vitest'
import { rotate } from '../../src/main/scan/image'
import { processPage } from '../../src/main/scan/pipeline'
import { rasterize, type RasterPage } from '../../src/main/scan/stages/rasterize'
import { T_BLANK } from '../../src/main/scan/thresholds'
import { PdfService } from '../../src/main/services/pdf.service'
import { AppError } from '../../src/main/services/errors'
import { AS_NUMBER_GUTTER, AS_ROW_PITCH, buildAnswerSheetLayout, type SheetLayout } from '../../src/shared/layout'
import type { StoredQuestion, Test } from '../../src/shared/types'
import { SYN_SECTION, cloneImage, fillBubble, syntheticContext, syntheticStudent, syntheticTest } from '../helpers/synthetic'

/**
 * Answer-sheet-only tests through the whole pipeline: our own PdfService
 * draws the grid from the layout cells, the reader samples the same cells.
 */

const SHEET_CODE = 'ANSWR1'
const SHEET_ID = 12

function answerSheet(counts: number[], defaultCount: number, trueFalseRows: number[] = []): { test: Test; layout: SheetLayout } {
  const layout = buildAnswerSheetLayout(counts, defaultCount)
  const questions: StoredQuestion[] = counts.map((count, i) => ({
    id: 500 + i,
    position: i,
    stem: '',
    choices: Array.from({ length: count }, () => ''),
    correctChoice: (i * 7) % count,
    points: 1,
    labelStyle: trueFalseRows.includes(i) ? 'true_false' : 'letters',
    countOverridden: count !== defaultCount
  }))
  const test: Test = {
    ...syntheticTest(),
    id: SHEET_ID,
    code: SHEET_CODE,
    kind: 'answer_sheet',
    title: `Answer sheet with ${counts.length} questions`,
    defaultChoiceCount: defaultCount,
    layout,
    questions
  }
  return { test, layout }
}

async function renderPages(test: Test, layout: SheetLayout, blank = false): Promise<RasterPage[]> {
  const pdf = await new PdfService().render({
    test,
    layout,
    students: blank ? [] : [syntheticStudent()],
    blankCount: blank ? 1 : 0,
    dateLabel: null
  })
  expect(pdf.pageCount).toBe(1)
  return rasterize(pdf.buffer, 'application/pdf')
}

function context(layout: SheetLayout) {
  return syntheticContext({ tests: { [SHEET_CODE]: { id: SHEET_ID, sectionId: SYN_SECTION, layoutVersion: 1, layout } } })
}

function key(test: Test): number[] {
  return test.questions.map((q) => q.correctChoice)
}

describe('answer-sheet scanning', () => {
  const seventyTwo = answerSheet([...Array<number>(60).fill(5), ...Array<number>(12).fill(2)], 5, Array.from({ length: 12 }, (_, i) => 60 + i))
  let seventyTwoPage: RasterPage

  beforeAll(async () => {
    seventyTwoPage = (await renderPages(seventyTwo.test, seventyTwo.layout))[0] as RasterPage
  })

  it('reads a 72-question sheet with a true/false block filled in pencil', async () => {
    const page = { ...seventyTwoPage, image: cloneImage(seventyTwoPage.image) }
    key(seventyTwo.test).forEach((choice, q) => fillBubble(page, seventyTwo.layout, q, choice, 120))
    const { result, crops } = await processPage({ pageIndex: 0, image: page.image }, context(seventyTwo.layout))
    expect(result.qr?.payload.testCode).toBe(SHEET_CODE)
    expect(result.alignment.quality).toBe('good')
    expect(result.bucket).toBe('graded')
    expect(result.testId).toBe(SHEET_ID)
    expect(result.answers).toHaveLength(72)
    expect(result.answers?.map((r) => r.state)).toEqual(Array<string>(72).fill('filled'))
    expect(result.answers?.map((r) => r.choice)).toEqual(key(seventyTwo.test))
    expect(result.answers?.map((r) => r.fills.length)).toEqual(seventyTwo.layout.choiceCounts)
    expect(result.flags).toEqual([])
    expect(Object.keys(crops)).toEqual([])
  })

  it('reads an untouched sheet as blank despite the printed letters, and crops flagged cells', async () => {
    const { result, crops } = await processPage({ pageIndex: 0, image: seventyTwoPage.image }, context(seventyTwo.layout))
    expect(result.answers?.map((r) => r.state)).toEqual(Array<string>(72).fill('blank'))
    const fills = result.answers?.flatMap((r) => r.fills) ?? []
    expect(Math.max(...fills)).toBeLessThan(T_BLANK * (2 / 3))
    // Every row is flagged blank, so every row gets a crop the size of its grid cell.
    expect(Object.keys(crops)).toHaveLength(72)
    const cell = crops.row_30
    expect(cell?.width).toBe((AS_NUMBER_GUTTER + 5 * 24) * 2)
    expect(cell?.height).toBe(AS_ROW_PITCH * 2)
  })

  it('reads a 96-question four-bubble sheet fed in upside down and marked in pen', async () => {
    const sheet = answerSheet(Array<number>(96).fill(4), 4)
    const page = (await renderPages(sheet.test, sheet.layout))[0] as RasterPage
    key(sheet.test).forEach((choice, q) => fillBubble(page, sheet.layout, q, choice, 15))
    const upsideDown = rotate(page.image, 180)
    const { result } = await processPage({ pageIndex: 0, image: upsideDown }, context(sheet.layout))
    expect(result.rotation).toBe(180)
    expect(result.bucket).toBe('graded')
    expect(result.answers?.map((r) => r.choice)).toEqual(key(sheet.test))
    expect(result.flags).toEqual([])
  })

  it('reads a 48-question eight-bubble sheet including answers on H', async () => {
    const sheet = answerSheet(Array<number>(48).fill(8), 8)
    expect(key(sheet.test)).toContain(7)
    const page = (await renderPages(sheet.test, sheet.layout, true))[0] as RasterPage
    key(sheet.test).forEach((choice, q) => fillBubble(page, sheet.layout, q, choice, 120))
    const { result } = await processPage({ pageIndex: 0, image: page.image }, context(sheet.layout))
    expect(result.qr?.payload.studentCode).toBeNull()
    expect(result.bucket).toBe('needs_assignment')
    expect(result.answers?.map((r) => r.choice)).toEqual(key(sheet.test))
  })

  it('refuses to print when the stored layout no longer matches the questions', async () => {
    const sheet = answerSheet(Array<number>(10).fill(5), 5)
    const shorter = { ...sheet.test, questions: sheet.test.questions.slice(0, 9) }
    await expect(new PdfService().render({ test: shorter, layout: sheet.layout, students: [syntheticStudent()], blankCount: 0, dateLabel: null })).rejects.toThrow(
      AppError
    )
  })
})
