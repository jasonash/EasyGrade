import type { Db } from '../database'
import { nowIso } from '../database'
import type {
  AlignmentQuality,
  BatchStatus,
  BucketCounts,
  DetectedRow,
  PageBucket,
  PageReason,
  ScanBatch,
  ScanPage
} from '@shared/schemas'
import { EMPTY_COUNTS } from '@shared/schemas'

interface BatchRow {
  id: number
  source_description: string
  page_count: number
  status: string
  imported_at: string
  completed_at: string | null
  errors_json: string
}

interface PageRow {
  id: number
  batch_id: number
  page_index: number
  image_path: string
  thumb_path: string | null
  status: string
  bucket: string | null
  reason: string | null
  rotation: number | null
  alignment_quality: string | null
  alignment_residual: number | null
  qr_payload: string | null
  test_id: number | null
  student_id: number | null
  assigned_by: string | null
  detected_json: string | null
  crops_json: string | null
  result_id: number | null
  processed_at: string | null
}

const BUCKETS: PageBucket[] = ['graded', 'needs_assignment', 'unreadable', 'not_a_sheet', 'discarded']
const REASONS: PageReason[] = ['qr', 'alignment', 'orientation', 'roster_mismatch', 'blank_sheet', 'conflict', 'unknown_test', 'layout']

function toBucket(value: string | null): PageBucket | null {
  return BUCKETS.find((b) => b === value) ?? null
}

function toReason(value: string | null): PageReason | null {
  return REASONS.find((r) => r === value) ?? null
}

function toStatus(value: string): BatchStatus {
  return value === 'processing' || value === 'complete' || value === 'error' ? value : 'pending'
}

function toQuality(value: string | null): AlignmentQuality | null {
  return value === 'good' || value === 'weak' || value === 'failed' ? value : null
}

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function toPage(row: PageRow): ScanPage {
  const assignedBy = row.assigned_by === 'qr' || row.assigned_by === 'teacher' ? row.assigned_by : null
  const status = row.status === 'processed' || row.status === 'error' ? row.status : 'pending'
  return {
    id: row.id,
    batchId: row.batch_id,
    pageIndex: row.page_index,
    imagePath: row.image_path,
    thumbPath: row.thumb_path,
    status,
    bucket: toBucket(row.bucket),
    reason: toReason(row.reason),
    rotation: row.rotation,
    alignmentQuality: toQuality(row.alignment_quality),
    alignmentResidual: row.alignment_residual,
    qrPayload: row.qr_payload,
    testId: row.test_id,
    studentId: row.student_id,
    assignedBy,
    detected: parseJson<DetectedRow[] | null>(row.detected_json, null),
    crops: parseJson<Record<string, string>>(row.crops_json, {}),
    resultId: row.result_id,
    processedAt: row.processed_at
  }
}

export interface PageInsert {
  batchId: number
  pageIndex: number
  imagePath: string
  thumbPath: string | null
  status: 'processed' | 'error'
  bucket: PageBucket | null
  reason: PageReason | null
  rotation: number | null
  alignmentQuality: AlignmentQuality | null
  alignmentResidual: number | null
  qrPayload: string | null
  testId: number | null
  studentId: number | null
  assignedBy: 'qr' | null
  detected: DetectedRow[] | null
  crops: Record<string, string>
}

export interface BatchPatch {
  pageCount?: number
  status?: BatchStatus
  completedAt?: string | null
  errors?: string[]
}

export class ScanRepository {
  constructor(private readonly db: Db) {}

  insertBatch(sourceDescription: string): ScanBatch {
    const info = this.db
      .prepare(
        `INSERT INTO scan_batches (source_description, page_count, status, imported_at, errors_json)
         VALUES (?, 0, 'processing', ?, '[]')`
      )
      .run(sourceDescription, nowIso())
    const batch = this.getBatch(Number(info.lastInsertRowid))
    if (!batch) throw new Error('Batch insert failed')
    return batch
  }

  updateBatch(id: number, patch: BatchPatch): void {
    const sets: string[] = []
    const values: unknown[] = []
    if (patch.pageCount !== undefined) {
      sets.push('page_count = ?')
      values.push(patch.pageCount)
    }
    if (patch.status !== undefined) {
      sets.push('status = ?')
      values.push(patch.status)
    }
    if (patch.completedAt !== undefined) {
      sets.push('completed_at = ?')
      values.push(patch.completedAt)
    }
    if (patch.errors !== undefined) {
      sets.push('errors_json = ?')
      values.push(JSON.stringify(patch.errors))
    }
    if (sets.length === 0) return
    values.push(id)
    this.db.prepare(`UPDATE scan_batches SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  getBatch(id: number): ScanBatch | null {
    const row = this.db.prepare('SELECT * FROM scan_batches WHERE id = ?').get(id) as BatchRow | undefined
    return row ? this.toBatch(row) : null
  }

  listBatches(): ScanBatch[] {
    const rows = this.db.prepare('SELECT * FROM scan_batches ORDER BY imported_at DESC, id DESC').all() as BatchRow[]
    return rows.map((row) => this.toBatch(row))
  }

  deleteBatch(id: number): boolean {
    return this.db.prepare('DELETE FROM scan_batches WHERE id = ?').run(id).changes > 0
  }

  private toBatch(row: BatchRow): ScanBatch {
    return {
      id: row.id,
      sourceDescription: row.source_description,
      pageCount: row.page_count,
      status: toStatus(row.status),
      importedAt: row.imported_at,
      completedAt: row.completed_at,
      counts: this.countsFor(row.id),
      errors: parseJson<string[]>(row.errors_json, [])
    }
  }

  countsFor(batchId: number): BucketCounts {
    const rows = this.db
      .prepare('SELECT bucket, COUNT(*) AS n FROM scan_pages WHERE batch_id = ? AND bucket IS NOT NULL GROUP BY bucket')
      .all(batchId) as { bucket: string; n: number }[]
    const counts: BucketCounts = { ...EMPTY_COUNTS }
    for (const r of rows) {
      const bucket = toBucket(r.bucket)
      if (bucket) counts[bucket] = r.n
    }
    return counts
  }

  insertPage(input: PageInsert): ScanPage {
    const info = this.db
      .prepare(
        `INSERT INTO scan_pages (batch_id, page_index, image_path, thumb_path, status, bucket, reason, rotation,
           alignment_quality, alignment_residual, qr_payload, test_id, student_id, assigned_by, detected_json,
           crops_json, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.batchId,
        input.pageIndex,
        input.imagePath,
        input.thumbPath,
        input.status,
        input.bucket,
        input.reason,
        input.rotation,
        input.alignmentQuality,
        input.alignmentResidual,
        input.qrPayload,
        input.testId,
        input.studentId,
        input.assignedBy,
        input.detected ? JSON.stringify(input.detected) : null,
        JSON.stringify(input.crops),
        nowIso()
      )
    const page = this.getPage(Number(info.lastInsertRowid))
    if (!page) throw new Error('Page insert failed')
    return page
  }

  /** Bucket, reason, and result link after grading or a teacher decision. */
  setOutcome(pageId: number, patch: { bucket: PageBucket; reason: PageReason | null; resultId: number | null; studentId?: number | null }): void {
    if (patch.studentId !== undefined) {
      this.db
        .prepare('UPDATE scan_pages SET bucket = ?, reason = ?, result_id = ?, student_id = ? WHERE id = ?')
        .run(patch.bucket, patch.reason, patch.resultId, patch.studentId, pageId)
      return
    }
    this.db.prepare('UPDATE scan_pages SET bucket = ?, reason = ?, result_id = ? WHERE id = ?').run(patch.bucket, patch.reason, patch.resultId, pageId)
  }

  getPage(id: number): ScanPage | null {
    const row = this.db.prepare('SELECT * FROM scan_pages WHERE id = ?').get(id) as PageRow | undefined
    return row ? toPage(row) : null
  }

  listPages(batchId: number): ScanPage[] {
    const rows = this.db.prepare('SELECT * FROM scan_pages WHERE batch_id = ? ORDER BY page_index').all(batchId) as PageRow[]
    return rows.map(toPage)
  }
}
