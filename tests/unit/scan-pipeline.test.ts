import { beforeAll, describe, expect, it } from 'vitest'
import { createGray, rotate } from '../../src/main/scan/image'
import { processPage } from '../../src/main/scan/pipeline'
import type { RasterPage } from '../../src/main/scan/stages/rasterize'
import { CANONICAL_HEIGHT, CANONICAL_WIDTH, T_BLANK } from '../../src/main/scan/thresholds'
import { CHOICE_LETTERS } from '../../src/shared/layout'
import {
  SYN_CHOICE_COUNTS,
  SYN_KEY,
  SYN_OTHER_STUDENT,
  SYN_STUDENT_CODE,
  SYN_STUDENT_ID,
  SYN_TEST_CODE,
  SYN_TEST_ID,
  addLightingGradient,
  addNoise,
  cloneImage,
  eraseQr,
  fillBubble,
  paintDisc,
  paintRect,
  renderSyntheticPages,
  scribbleName,
  syntheticContext,
  syntheticLayout
} from '../helpers/synthetic'

/**
 * End-to-end pipeline tests on sheets our own PdfService rendered. These
 * run everywhere (no private fixtures): a clean personalized sheet, a blank
 * sheet, pencil and pen fills, rotations, noise, uneven lighting, a
 * damaged QR, and pages that are not answer sheets.
 */

const layout = syntheticLayout()
const ctx = syntheticContext()
let personalized: RasterPage
let blank: RasterPage

function pageCopy(page: RasterPage): RasterPage {
  return { ...page, image: cloneImage(page.image) }
}

function fillKey(page: RasterPage, gray: number): void {
  SYN_KEY.forEach((choice, q) => fillBubble(page, layout, q, choice, gray))
}

function letters(choices: (number | null)[]): string[] {
  return choices.map((c) => (c === null ? '-' : (CHOICE_LETTERS[c] ?? '?')))
}

beforeAll(async () => {
  const pages = await renderSyntheticPages()
  expect(pages).toHaveLength(2)
  personalized = pages[0] as RasterPage
  blank = pages[1] as RasterPage
})

describe('scan pipeline on synthetic sheets', () => {
  it('rasterizes letter pages at about 200 DPI', () => {
    expect(personalized.image.width).toBe(1700)
    expect(personalized.image.height).toBe(2200)
    expect(personalized.scale).toBeCloseTo(1700 / 612, 3)
  })

  it('grades an untouched personalized sheet as all blank', async () => {
    const { result, canonical, crops, thumbnail } = await processPage({ pageIndex: 0, image: personalized.image }, ctx)
    expect(result.qr?.payload).toEqual({ testCode: SYN_TEST_CODE, studentCode: SYN_STUDENT_CODE, layoutVersion: 1 })
    expect(result.qr?.strategy).toBe('zxing-full')
    expect(result.rotation).toBe(0)
    expect(result.alignment.method).toBe('qr')
    expect(result.alignment.marks).toHaveLength(4)
    expect(result.alignment.quality).toBe('good')
    expect(result.alignment.residual).not.toBeNull()
    expect(result.alignment.residual as number).toBeLessThan(3)
    const circle = result.alignment.marks.find((m) => m.corner === 'bottomRight')
    const square = result.alignment.marks.find((m) => m.corner === 'topLeft')
    expect(circle?.fillRatio ?? 1).toBeLessThan(0.88)
    expect(square?.fillRatio ?? 0).toBeGreaterThan(0.9)
    expect(result.bucket).toBe('graded')
    expect(result.testId).toBe(SYN_TEST_ID)
    expect(result.studentId).toBe(SYN_STUDENT_ID)
    expect(result.answers?.map((r) => r.state)).toEqual(Array<string>(10).fill('blank'))
    // Empty bubbles carry only the printed letter (about 0.08).
    expect(result.answers?.every((r) => r.fills.every((f) => f < 0.1))).toBe(true)
    expect(result.answers?.map((r) => r.fills.length)).toEqual(SYN_CHOICE_COUNTS)
    expect(canonical?.width).toBe(CANONICAL_WIDTH)
    expect(canonical?.height).toBe(CANONICAL_HEIGHT)
    expect(thumbnail.width).toBe(300)
    expect(Object.keys(crops).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `row_${i}`))
    expect(result.flags).toEqual(['low_confidence'])
  })

  it('keeps the letters printed inside the bubbles far below the blank threshold', async () => {
    const { result } = await processPage({ pageIndex: 0, image: personalized.image }, ctx)
    const fills = result.answers?.flatMap((r) => r.fills) ?? []
    expect(fills.length).toBeGreaterThan(0)
    // The letters are really there (the disc sees a little ink)...
    expect(Math.max(...fills)).toBeGreaterThan(0.005)
    // ...but an empty bubble stays under two thirds of T_BLANK (8 pt at 60% gray measures about 0.08), so a change of font, size, or gray cannot creep up on the reader.
    expect(Math.max(...fills)).toBeLessThan(T_BLANK * (2 / 3))
  })

  it('sends a blank sheet to assignment with name and section crops', async () => {
    const page = pageCopy(blank)
    scribbleName(page)
    fillKey(page, 120)
    const { result, crops } = await processPage({ pageIndex: 1, image: page.image }, ctx)
    expect(result.qr?.payload.studentCode).toBeNull()
    expect(result.bucket).toBe('needs_assignment')
    expect(result.reason).toBe('blank_sheet')
    expect(result.studentId).toBeNull()
    expect(result.testId).toBe(SYN_TEST_ID)
    expect(letters(result.answers?.map((r) => r.choice) ?? [])).toEqual(letters(SYN_KEY))
    expect(crops.name_box).toBeDefined()
    expect(crops.section_box).toBeDefined()
    expect(crops.name_box?.width).toBeGreaterThan(600)
  })

  it('reads pencil fills of the answer key', async () => {
    const page = pageCopy(personalized)
    fillKey(page, 120)
    const { result, crops } = await processPage({ pageIndex: 0, image: page.image }, ctx)
    expect(result.bucket).toBe('graded')
    expect(result.answers?.every((r) => r.state === 'filled')).toBe(true)
    expect(letters(result.answers?.map((r) => r.choice) ?? [])).toEqual(letters(SYN_KEY))
    expect(result.flags).toEqual([])
    expect(Object.keys(crops)).toEqual([])
  })

  it('reads pen fills and keeps the second darkest bubble near zero', async () => {
    const page = pageCopy(personalized)
    fillKey(page, 15)
    const { result } = await processPage({ pageIndex: 0, image: page.image }, ctx)
    expect(letters(result.answers?.map((r) => r.choice) ?? [])).toEqual(letters(SYN_KEY))
    for (const row of result.answers ?? []) {
      const sorted = [...row.fills].sort((a, b) => b - a)
      expect(sorted[0] ?? 0).toBeGreaterThan(0.8)
      expect(sorted[1] ?? 0).toBeLessThan(0.1)
    }
  })

  it('classifies double marks, faint strokes, and partial fills', async () => {
    const page = pageCopy(personalized)
    fillKey(page, 120)
    fillBubble(page, layout, 0, 2, 120) // q1: B and C both dark
    fillBubble(page, layout, 2, 0, 230) // q3: faint stroke on A next to the real E
    fillBubble(page, layout, 4, 3, 250, 0.4) // q5: replace the dark D with a very light small dot
    paintDisc(page.image, (layout.bubbleX[3] ?? 0) * page.scale, (layout.rowY[4] ?? 0) * page.scale, layout.bubbleRadius * page.scale * 0.96, 255)
    fillBubble(page, layout, 4, 3, 140, 0.55) // then a half-ish fill
    const { result } = await processPage({ pageIndex: 0, image: page.image }, ctx)
    const rows = result.answers ?? []
    expect(rows[0]?.state).toBe('multiple')
    expect(rows[2]?.state).toBe('filled')
    expect(rows[2]?.choice).toBe(4)
    expect(['filled', 'ambiguous']).toContain(rows[4]?.state)
    if (rows[4]?.state === 'filled') expect(rows[4].choice).toBe(3)
    expect(result.flags).toContain('low_confidence')
  })

  it.each([180, 90, 270] as const)('handles a page rotated %d degrees', async (degrees) => {
    const page = pageCopy(personalized)
    fillKey(page, 100)
    const rotated = rotate(page.image, degrees)
    const { result } = await processPage({ pageIndex: 0, image: rotated }, ctx)
    expect(result.qr?.payload.testCode).toBe(SYN_TEST_CODE)
    expect(result.alignment.marks).toHaveLength(4)
    // rotate() turns the image clockwise; the pipeline reports the clockwise turn that undoes it.
    expect(result.rotation).toBe((360 - degrees) % 360)
    expect(result.bucket).toBe('graded')
    expect(letters(result.answers?.map((r) => r.choice) ?? [])).toEqual(letters(SYN_KEY))
  })

  it('survives noise and uneven lighting', async () => {
    const page = pageCopy(personalized)
    fillKey(page, 110)
    addLightingGradient(page.image, 70)
    addNoise(page.image, 25, 7)
    const { result } = await processPage({ pageIndex: 0, image: page.image }, ctx)
    expect(result.bucket).toBe('graded')
    expect(result.alignment.marks).toHaveLength(4)
    expect(letters(result.answers?.map((r) => r.choice) ?? [])).toEqual(letters(SYN_KEY))
  })

  it('falls back to corner windows when the QR is destroyed', async () => {
    const page = pageCopy(personalized)
    fillKey(page, 100)
    eraseQr(page)
    const { result, canonical } = await processPage({ pageIndex: 0, image: page.image }, ctx)
    expect(result.qr).toBeNull()
    expect(result.alignment.method).toBe('corners')
    expect(result.alignment.marks).toHaveLength(4)
    expect(result.rotation).toBe(0)
    expect(result.bucket).toBe('unreadable')
    expect(result.reason).toBe('qr')
    expect(result.answers).toBeNull()
    expect(canonical).not.toBeNull()

    const upsideDown = rotate(page.image, 180)
    const flipped = await processPage({ pageIndex: 0, image: upsideDown }, ctx)
    expect(flipped.result.alignment.marks).toHaveLength(4)
    expect(flipped.result.rotation).toBe(180)
    expect(flipped.result.bucket).toBe('unreadable')
  })

  it('routes unknown tests, stale layouts, and roster mismatches', async () => {
    const page = pageCopy(personalized)
    fillKey(page, 100)

    const unknownTest = await processPage({ pageIndex: 0, image: page.image }, { tests: {}, students: ctx.students })
    expect(unknownTest.result.bucket).toBe('needs_assignment')
    expect(unknownTest.result.reason).toBe('unknown_test')
    expect(unknownTest.result.answers).toBeNull()

    const stale = await processPage(
      { pageIndex: 0, image: page.image },
      syntheticContext({ tests: { [SYN_TEST_CODE]: { id: SYN_TEST_ID, sectionId: 1, layoutVersion: 2, layout } } })
    )
    expect(stale.result.bucket).toBe('unreadable')
    expect(stale.result.reason).toBe('layout')
    expect(stale.result.flags).toContain('stale_layout')

    const strangers = await processPage(
      { pageIndex: 0, image: page.image },
      syntheticContext({ students: { [SYN_STUDENT_CODE]: { id: 5, sectionId: 42 }, [SYN_OTHER_STUDENT]: { id: 6, sectionId: 42 } } })
    )
    expect(strangers.result.bucket).toBe('needs_assignment')
    expect(strangers.result.reason).toBe('roster_mismatch')
    expect(strangers.result.answers).not.toBeNull()
    expect(strangers.result.studentId).toBeNull()

    const nobody = await processPage({ pageIndex: 0, image: page.image }, syntheticContext({ students: {} }))
    expect(nobody.result.reason).toBe('roster_mismatch')
  })

  it('recognizes pages that are not answer sheets', async () => {
    const white = createGray(1700, 2200)
    const empty = await processPage({ pageIndex: 3, image: white }, ctx)
    expect(empty.result.bucket).toBe('not_a_sheet')
    expect(empty.result.qr).toBeNull()
    expect(empty.canonical).toBeNull()

    const letter = createGray(1700, 2200)
    for (let line = 0; line < 40; line++) paintRect(letter, 200, 200 + line * 45, 1500, 200 + line * 45 + 12, 60)
    const text = await processPage({ pageIndex: 4, image: letter }, ctx)
    expect(text.result.bucket).toBe('not_a_sheet')
    expect(text.result.alignment.marks.length).toBeLessThan(4)
  })
})
