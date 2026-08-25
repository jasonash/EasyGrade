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
