import type { SheetLayout } from '@shared/layout'
import type { DetectedRow, PageBucket, PageFlag, PageReason, ScanContext, ScanPageResult } from '@shared/schemas'
import type { GrayImage } from './image'
import { alignPage } from './stages/align'
import { makeCrops, makeThumbnail } from './stages/crops'
import { findMarks } from './stages/marks'
import { classifyRows, pageReferences, sampleFills } from './stages/omr'
import { readQr } from './stages/qr'

/**
 * One page in, one ScanPageResult (plus images to persist) out. Pure apart
 * from the zxing module initialization; nothing here touches the database
 * or the filesystem, so it runs the same in the worker thread and in tests.
 */

export interface PageInput {
  pageIndex: number
  image: GrayImage
}

export interface PageOutput {
  result: ScanPageResult
  /** Upright, unwarped canonical page when the marks were found. */
  canonical: GrayImage | null
  thumbnail: GrayImage
  crops: Record<string, GrayImage>
}

export async function processPage(input: PageInput, ctx: ScanContext): Promise<PageOutput> {
  const started = performance.now()
  const { image, pageIndex } = input

  const qr = await readQr(image)
  const search = findMarks(image, qr)
  const aligned = alignPage(image, search.marks, search.method, qr)
  const marksFound = aligned.canonical !== null

  const test = qr ? (ctx.tests[qr.payload.testCode] ?? null) : null
  const student = qr?.payload.studentCode ? (ctx.students[qr.payload.studentCode] ?? null) : null
  const flags: PageFlag[] = []
  let layout: SheetLayout | null = null
  if (test && qr) {
    if (test.layoutVersion === qr.payload.layoutVersion) layout = test.layout
    else flags.push('stale_layout')
  }
  if (aligned.info.quality === 'weak') flags.push('weak_alignment')

  let answers: DetectedRow[] | null = null
  if (aligned.canonical && layout) {
    const refs = pageReferences(aligned.canonical)
    if (refs.usable) {
      answers = classifyRows(sampleFills(aligned.canonical, layout, refs))
      if (aligned.info.quality === 'weak' || answers.some((r) => r.state !== 'filled')) {
        if (!flags.includes('low_confidence')) flags.push('low_confidence')
      }
    }
  }

  const { bucket, reason } = decideBucket({
    marksFound,
    sawCandidates: search.sawCandidates,
    qrDecoded: qr !== null,
    testKnown: test !== null,
    layoutUsable: layout !== null && answers !== null,
    studentCode: qr?.payload.studentCode ?? null,
    studentKnown: student !== null,
    studentInSection: student !== null && test !== null && student.sectionId === test.sectionId
  })

  const blankSheet = qr !== null && qr.payload.studentCode === null
  const crops = makeCrops(aligned.canonical, layout, answers, blankSheet)
  const thumbnail = makeThumbnail(aligned.canonical ?? image)

  const result: ScanPageResult = {
    pageIndex,
    sourceWidth: image.width,
    sourceHeight: image.height,
    rotation: search.rotation,
    qr,
    alignment: aligned.info,
    testId: test?.id ?? null,
    studentId: bucket === 'graded' ? (student?.id ?? null) : null,
    answers,
    flags,
    bucket,
    reason,
    elapsedMs: Math.round(performance.now() - started)
  }
  return { result, canonical: aligned.canonical, thumbnail, crops }
}

export interface BucketInputs {
  marksFound: boolean
  sawCandidates: boolean
  qrDecoded: boolean
  testKnown: boolean
  layoutUsable: boolean
  studentCode: string | null
  studentKnown: boolean
  studentInSection: boolean
}

/** ARCHITECTURE 6.4, with two extra reasons: unknown_test and layout (stale layout version). */
export function decideBucket(i: BucketInputs): { bucket: PageBucket; reason: PageReason | null } {
  if (i.marksFound) {
    if (!i.qrDecoded) return { bucket: 'unreadable', reason: 'qr' }
    if (!i.testKnown) return { bucket: 'needs_assignment', reason: 'unknown_test' }
    if (!i.layoutUsable) return { bucket: 'unreadable', reason: 'layout' }
    if (i.studentCode === null) return { bucket: 'needs_assignment', reason: 'blank_sheet' }
    if (!i.studentKnown || !i.studentInSection) return { bucket: 'needs_assignment', reason: 'roster_mismatch' }
    return { bucket: 'graded', reason: null }
  }
  if (i.qrDecoded) return { bucket: 'needs_assignment', reason: 'alignment' }
  if (!i.sawCandidates) return { bucket: 'not_a_sheet', reason: null }
  return { bucket: 'unreadable', reason: 'alignment' }
}
