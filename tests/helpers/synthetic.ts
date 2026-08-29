import type { SheetLayout } from '../../src/shared/layout'
import { NAME_BOX, QR_SIZE, QR_X, QR_Y, bubbleCenter, buildSheetLayout } from '../../src/shared/layout'
import type { Student, Test } from '../../src/shared/types'
import type { ScanContext } from '../../src/shared/schemas'
import { PdfService } from '../../src/main/services/pdf.service'
import { rasterize, type RasterPage } from '../../src/main/scan/stages/rasterize'
import type { GrayImage } from '../../src/main/scan/image'
import { CLEAN_TEST, fixtureChoices } from '../fixtures/calibration'

/**
 * Synthetic scan fixtures: sheets rendered by our own PdfService, rasterized
 * with mupdf, then marked up, rotated, and dirtied programmatically. The
 * sheet is axis-aligned at a known scale, so bubble positions are exact.
 */

export const SYN_TEST_CODE = 'ABCDEF'
export const SYN_STUDENT_CODE = 'GHJKMN'
export const SYN_OTHER_STUDENT = 'PQRSTV'
export const SYN_SECTION = 1
export const SYN_TEST_ID = 11
export const SYN_STUDENT_ID = 21

export const SYN_CHOICE_COUNTS = CLEAN_TEST.questions.map((q) => q.choiceCount)
export const SYN_KEY = CLEAN_TEST.questions.map((q) => q.key)

export function syntheticLayout(): SheetLayout {
  return buildSheetLayout(SYN_CHOICE_COUNTS)
}

export function syntheticTest(layoutVersion = 1): Test {
  const now = '2026-08-25T12:00:00.000Z'
  return {
    id: SYN_TEST_ID,
    sectionId: SYN_SECTION,
    sectionName: 'Synthetic Block',
    schoolYear: '2026-27',
    code: SYN_TEST_CODE,
    title: CLEAN_TEST.title,
    instructions: CLEAN_TEST.instructions,
    kind: 'standard',
    status: 'finalized',
    defaultChoiceCount: null,
    linkUrl: null,
    attachment: null,
    layoutVersion,
    layout: syntheticLayout(),
    finalizedAt: now,
    lastPrintedAt: null,
    questions: CLEAN_TEST.questions.map((q, i) => ({
      id: 100 + i,
      position: i,
      stem: q.stem,
      choices: fixtureChoices(q.choiceCount),
      correctChoice: q.key,
      points: 1,
      labelStyle: 'letters' as const,
      countOverridden: false
    })),
    resultCount: 0,
    createdAt: now,
    updatedAt: now
  }
}

export function syntheticStudent(): Student {
  const now = '2026-08-25T12:00:00.000Z'
  return {
    id: SYN_STUDENT_ID,
    sectionId: SYN_SECTION,
    code: SYN_STUDENT_CODE,
    lastName: 'Synth',
    firstName: 'Sam',
    studentNumber: '424242',
    active: true,
    resultCount: 0,
    createdAt: now,
    updatedAt: now
  }
}

export function syntheticContext(overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    tests: { [SYN_TEST_CODE]: { id: SYN_TEST_ID, sectionId: SYN_SECTION, layoutVersion: 1, layout: syntheticLayout() } },
    students: {
      [SYN_STUDENT_CODE]: { id: SYN_STUDENT_ID, sectionId: SYN_SECTION },
      [SYN_OTHER_STUDENT]: { id: 99, sectionId: SYN_SECTION + 1 }
    },
    ...overrides
  }
}

/** Render one personalized sheet and one blank sheet, then rasterize both. */
export async function renderSyntheticPages(): Promise<RasterPage[]> {
  const test = syntheticTest()
  const pdf = await new PdfService().render({
    test,
    layout: test.layout as SheetLayout,
    students: [syntheticStudent()],
    blankCount: 1,
    dateLabel: 'Aug 25'
  })
  return rasterize(pdf.buffer, 'application/pdf')
}

export function cloneImage(img: GrayImage): GrayImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
}

/** Paint a disc of the given gray level (0 black) centred on a bubble. `coverage` scales the radius. */
export function fillBubble(page: RasterPage, layout: SheetLayout, q: number, choice: number, gray: number, coverage = 0.95): void {
  const scale = page.scale
  const center = bubbleCenter(layout, q, choice)
  if (!center) throw new Error(`No bubble ${choice} for question ${q}`)
  const cx = center[0] * scale
  const cy = center[1] * scale
  const r = layout.bubbleRadius * scale * coverage
  paintDisc(page.image, cx, cy, r, gray)
}

export function paintDisc(img: GrayImage, cx: number, cy: number, r: number, gray: number): void {
  const r2 = r * r
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) img.data[y * img.width + x] = gray
    }
  }
}

export function paintRect(img: GrayImage, x0: number, y0: number, x1: number, y1: number, gray: number): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, Math.ceil(x1)); x++) img.data[y * img.width + x] = gray
  }
}

/** White out the QR symbol (plus its quiet zone) so the page has marks but no code. */
export function eraseQr(page: RasterPage): void {
  const s = page.scale
  paintRect(page.image, (QR_X - 6) * s, (QR_Y - 6) * s, (QR_X + QR_SIZE + 6) * s, (QR_Y + QR_SIZE + 6) * s, 255)
}

/** Deterministic pseudo-random noise (LCG) added to every pixel. */
export function addNoise(img: GrayImage, amplitude: number, seed = 1): void {
  let state = seed >>> 0
  for (let i = 0; i < img.data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const n = ((state >>> 8) / 0xffffff - 0.5) * 2 * amplitude
    img.data[i] = Math.max(0, Math.min(255, Math.round((img.data[i] ?? 255) + n)))
  }
}

/** Darken the page progressively from left to right, like uneven lighting on a phone photo. */
export function addLightingGradient(img: GrayImage, maxDrop: number): void {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const drop = (x / img.width) * maxDrop
      const i = y * img.width + x
      img.data[i] = Math.max(0, Math.round((img.data[i] ?? 255) - drop))
    }
  }
}

/** Scribble across the name box like a handwritten name. */
export function scribbleName(page: RasterPage): void {
  const s = page.scale
  const [x1, y1, x2, y2] = NAME_BOX
  for (let k = 0; k < 40; k++) {
    const x = (x1 + 10 + (k * (x2 - x1 - 20)) / 40) * s
    const y = ((y1 + y2) / 2 + Math.sin(k) * 6) * s
    paintDisc(page.image, x, y, 2 * s, 30)
  }
}
