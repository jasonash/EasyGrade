import { z } from 'zod'
import type { SheetLayout } from '../layout/geometry'
import type { QrPayload } from '../codes'

/**
 * Scan pipeline output shapes. These are what the worker returns for every
 * page and what scan_pages.detected_json / crops_json store (DATA_MODEL 3.7
 * and 4.2). Buckets and reasons match the data model exactly.
 */

export const PageBucketSchema = z.enum(['graded', 'needs_assignment', 'unreadable', 'not_a_sheet', 'discarded'])
export type PageBucket = z.infer<typeof PageBucketSchema>

export const PageReasonSchema = z.enum([
  'qr',
  'alignment',
  'orientation',
  'roster_mismatch',
  'blank_sheet',
  'conflict',
  'unknown_test',
  'layout'
])
export type PageReason = z.infer<typeof PageReasonSchema>

export const RowStateSchema = z.enum(['filled', 'blank', 'multiple', 'ambiguous'])
export type RowState = z.infer<typeof RowStateSchema>

export const DetectedRowSchema = z.object({
  q: z.number().int().min(0),
  state: RowStateSchema,
  /** Zero-based choice index when state is filled, otherwise null. */
  choice: z.number().int().min(0).nullable(),
  /** Normalized darkness per choice, 0 = paper white, 1 = printed ink. */
  fills: z.array(z.number()),
  confidence: z.number().min(0).max(1)
})
export type DetectedRow = z.infer<typeof DetectedRowSchema>

export const AlignmentQualitySchema = z.enum(['good', 'weak', 'failed'])
export type AlignmentQuality = z.infer<typeof AlignmentQualitySchema>

export const PageFlagSchema = z.enum(['low_confidence', 'weak_alignment', 'stale_layout'])
export type PageFlag = z.infer<typeof PageFlagSchema>

/** A point in source-image pixels. */
export interface Point {
  x: number
  y: number
}

export type MarkCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface MarkDetection {
  corner: MarkCorner
  center: Point
  /** Blob area over its bounding box area: about 1 for a square, 0.79 for a circle. */
  fillRatio: number
  areaPx: number
}

export interface QrDetection {
  raw: string
  payload: QrPayload
  /** Symbol corners in source pixels, in the symbol's own frame. */
  position: { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point } | null
  /** Which decode strategy succeeded, for diagnostics. */
  strategy: string
}

export interface AlignmentInfo {
  quality: AlignmentQuality
  /** Worst reprojection error of the QR corners, in canonical pixels; null when no QR was decoded. */
  residual: number | null
  marks: MarkDetection[]
  /** How the marks were located. */
  method: 'qr' | 'corners' | 'none'
}

/**
 * What the pipeline knows about the world: the finalized tests and the
 * students whose codes can appear in a QR. Plain data so it can be posted to
 * the worker thread as one message.
 */
export interface ScanContext {
  tests: Record<string, ScanContextTest>
  students: Record<string, ScanContextStudent>
}

export interface ScanContextTest {
  id: number
  sectionId: number
  layoutVersion: number
  layout: SheetLayout
}

export interface ScanContextStudent {
  id: number
  sectionId: number
}

/** Result for one page, before anything touches the database. */
export interface ScanPageResult {
  pageIndex: number
  sourceWidth: number
  sourceHeight: number
  /** Rotation applied to bring the page upright: 0, 90, 180, or 270. Null when unknown. */
  rotation: number | null
  qr: QrDetection | null
  alignment: AlignmentInfo
  testId: number | null
  studentId: number | null
  answers: DetectedRow[] | null
  flags: PageFlag[]
  bucket: PageBucket
  reason: PageReason | null
  /** Milliseconds spent on this page. */
  elapsedMs: number
}

/** Persisted shapes (scan_batches, scan_pages, results) as the renderer sees them. */

export const BatchStatusSchema = z.enum(['pending', 'processing', 'complete', 'error'])
export type BatchStatus = z.infer<typeof BatchStatusSchema>

export type BucketCounts = Record<PageBucket, number>

/** A test that pages in a batch were matched to, so the batch list can say what was scanned. */
export interface BatchTest {
  id: number
  title: string
  sectionName: string
  /** Pages in the batch attached to this test (any bucket except discarded). */
  pages: number
}

export interface ScanBatch {
  id: number
  sourceDescription: string
  /** Distinct tests among the batch's pages, most pages first. Empty when nothing was recognized. */
  tests: BatchTest[]
  pageCount: number
  status: BatchStatus
  importedAt: string
  completedAt: string | null
  counts: BucketCounts
  /** Graded pages whose result nobody has looked at yet (flagged reads; clean reads start reviewed). */
  unreviewedCount: number
  /** Files that could not be read at all, with the reason. */
  errors: string[]
  /** Set when the retention purge removed this batch's page images. Results are untouched. */
  purgedAt: string | null
}

export interface ScanPage {
  id: number
  batchId: number
  pageIndex: number
  /** Relative to the scans directory. */
  imagePath: string
  thumbPath: string | null
  status: 'pending' | 'processed' | 'error'
  bucket: PageBucket | null
  reason: PageReason | null
  rotation: number | null
  alignmentQuality: AlignmentQuality | null
  alignmentResidual: number | null
  qrPayload: string | null
  testId: number | null
  studentId: number | null
  assignedBy: 'qr' | 'teacher' | null
  detected: DetectedRow[] | null
  crops: Record<string, string>
  resultId: number | null
  processedAt: string | null
}

export const QuestionFlagSchema = z.object({
  q: z.number().int().min(0),
  kind: z.enum(['blank', 'multiple', 'ambiguous', 'low_confidence'])
})
export type QuestionFlag = z.infer<typeof QuestionFlagSchema>

/** A teacher's decision for one question, stored in answer_overrides. */
export interface AnswerOverride {
  q: number
  /** What the scanner detected at the time of the override. */
  rawChoice: number | null
  /** What the teacher chose; null means "count as blank". */
  overrideChoice: number | null
  note: string | null
}

export interface GradeResult {
  id: number
  testId: number
  studentId: number
  scanPageId: number | null
  layoutVersion: number
  rawAnswers: (number | null)[]
  /** rawAnswers with overrides applied. */
  finalAnswers: (number | null)[]
  correctCount: number
  possibleCount: number
  /** Per-question flags remaining after overrides. */
  flags: QuestionFlag[]
  overrides: AnswerOverride[]
  reviewed: boolean
  gradedAt: string
  updatedAt: string
}

/** A page plus the names the review screens show, resolved in one query. */
export interface ScanPageDetail extends ScanPage {
  testTitle: string | null
  testCode: string | null
  /** The test's gradebook worth, so lists can show points without loading the test. */
  testTotalPoints: number | null
  studentName: string | null
  studentNumber: string | null
  sectionName: string | null
  result: GradeResult | null
}

/** Progress event streamed to the renderer while a batch imports. */
export interface ScanProgress {
  batchId: number
  phase: 'starting' | 'processing' | 'complete' | 'error'
  pagesTotal: number
  pagesDone: number
  currentFile: string | null
  counts: BucketCounts
  message: string | null
}

export const EMPTY_COUNTS: BucketCounts = { graded: 0, needs_assignment: 0, unreadable: 0, not_a_sheet: 0, discarded: 0 }
