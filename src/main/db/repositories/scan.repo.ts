import type { Db } from '../database'
import { nowIso } from '../database'
import type {
  AlignmentQuality,
  BatchStatus,
  BatchTest,
  BucketCounts,
  DetectedRow,
  PageBucket,
  PageReason,
  ScanBatch,
  ScanPage,
  ScanPageDetail
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
  purged_at: string | null
}

interface PageRow {
  id: number
  test_title: string | null
  test_code: string | null
  student_last: string | null
  student_first: string | null
  student_number: string | null
  section_name: string | null
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

const PAGE_SELECT = `
  SELECT p.*, t.title AS test_title, t.code AS test_code,
    st.last_name AS student_last, st.first_name AS student_first, st.student_number,
    COALESCE(ss.name, ts.name) AS section_name
  FROM scan_pages p
  LEFT JOIN tests t ON t.id = p.test_id
  LEFT JOIN sections ts ON ts.id = t.section_id
  LEFT JOIN students st ON st.id = p.student_id
  LEFT JOIN sections ss ON ss.id = st.section_id`

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

function toPage(row: PageRow): ScanPageDetail {
  const assignedBy = row.assigned_by === 'qr' || row.assigned_by === 'teacher' ? row.assigned_by : null
  const status = row.status === 'processed' || row.status === 'error' ? row.status : 'pending'
  const studentName = row.student_last !== null && row.student_first !== null ? `${row.student_last}, ${row.student_first}` : null
  return {
    id: row.id,
    testTitle: row.test_title,
    testCode: row.test_code,
    studentName,
    studentNumber: row.student_number,
    sectionName: row.section_name,
    result: null,
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

/** Teacher assignment or a re-detection with a different layout. */
export interface PagePatch {
  bucket?: PageBucket
  reason?: PageReason | null
  resultId?: number | null
  testId?: number | null
  studentId?: number | null
  assignedBy?: 'qr' | 'teacher' | null
  detected?: DetectedRow[] | null
  crops?: Record<string, string>
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

  private testsFor(batchId: number): BatchTest[] {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.title, s.name AS section_name, COUNT(*) AS pages
         FROM scan_pages p
         JOIN tests t ON t.id = p.test_id
         JOIN sections s ON s.id = t.section_id
         WHERE p.batch_id = ? AND (p.bucket IS NULL OR p.bucket != 'discarded')
         GROUP BY t.id
         ORDER BY pages DESC, t.title`
      )
      .all(batchId) as { id: number; title: string; section_name: string; pages: number }[]
    return rows.map((r) => ({ id: r.id, title: r.title, sectionName: r.section_name, pages: r.pages }))
  }

  private toBatch(row: BatchRow): ScanBatch {
    return {
      id: row.id,
      sourceDescription: row.source_description,
      tests: this.testsFor(row.id),
      pageCount: row.page_count,
      status: toStatus(row.status),
      importedAt: row.imported_at,
      completedAt: row.completed_at,
      counts: this.countsFor(row.id),
      errors: parseJson<string[]>(row.errors_json, []),
      purgedAt: row.purged_at
    }
  }

  /** Finished batches imported before the cutoff whose images are still on disk. */
  listPurgeCandidates(cutoffIso: string): ScanBatch[] {
    const rows = this.db
      .prepare(`SELECT * FROM scan_batches WHERE imported_at < ? AND purged_at IS NULL AND status IN ('complete', 'error') ORDER BY imported_at`)
      .all(cutoffIso) as BatchRow[]
    return rows.map((row) => this.toBatch(row))
  }

  /** Record that a batch's images are gone: pages keep their detection and results, lose their image links. */
  markPurged(batchId: number, at: string): void {
    const run = this.db.transaction(() => {
      this.db.prepare('UPDATE scan_batches SET purged_at = ? WHERE id = ?').run(at, batchId)
      this.db.prepare(`UPDATE scan_pages SET image_path = '', thumb_path = NULL, crops_json = '{}' WHERE batch_id = ?`).run(batchId)
    })
    run()
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

  updatePage(id: number, patch: PagePatch): void {
    const sets: string[] = []
    const values: unknown[] = []
    const add = (column: string, value: unknown): void => {
      sets.push(`${column} = ?`)
      values.push(value)
    }
    if (patch.bucket !== undefined) add('bucket', patch.bucket)
    if (patch.reason !== undefined) add('reason', patch.reason)
    if (patch.resultId !== undefined) add('result_id', patch.resultId)
    if (patch.testId !== undefined) add('test_id', patch.testId)
    if (patch.studentId !== undefined) add('student_id', patch.studentId)
    if (patch.assignedBy !== undefined) add('assigned_by', patch.assignedBy)
    if (patch.detected !== undefined) add('detected_json', patch.detected ? JSON.stringify(patch.detected) : null)
    if (patch.crops !== undefined) add('crops_json', JSON.stringify(patch.crops))
    if (sets.length === 0) return
    values.push(id)
    this.db.prepare(`UPDATE scan_pages SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  /** Page with test, student, and section names resolved; `result` is left for the service to attach. */
  getPage(id: number): ScanPageDetail | null {
    const row = this.db.prepare(`${PAGE_SELECT} WHERE p.id = ?`).get(id) as PageRow | undefined
    return row ? toPage(row) : null
  }

  listPages(batchId: number): ScanPageDetail[] {
    const rows = this.db.prepare(`${PAGE_SELECT} WHERE p.batch_id = ? ORDER BY p.page_index`).all(batchId) as PageRow[]
    return rows.map(toPage)
  }

  /** Every page in any batch that resolved to this test (for the Results view's page links). */
  listPagesByTest(testId: number): ScanPage[] {
    const rows = this.db.prepare(`${PAGE_SELECT} WHERE p.test_id = ? ORDER BY p.batch_id, p.page_index`).all(testId) as PageRow[]
    return rows.map(toPage)
  }
}
