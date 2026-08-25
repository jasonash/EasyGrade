import type { Db } from '../database'
import { nowIso } from '../database'
import type { GradeResult, QuestionFlag } from '@shared/schemas'

interface ResultRow {
  id: number
  test_id: number
  student_id: number
  scan_page_id: number | null
  layout_version: number
  raw_answers_json: string
  final_answers_json: string
  correct_count: number
  possible_count: number
  flags_json: string
  reviewed: number
  graded_at: string
  updated_at: string
}

function parseAnswers(json: string): (number | null)[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map((v) => (typeof v === 'number' ? v : null)) : []
  } catch {
    return []
  }
}

function parseFlags(json: string): QuestionFlag[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as QuestionFlag[]) : []
  } catch {
    return []
  }
}

function toResult(row: ResultRow): GradeResult {
  return {
    id: row.id,
    testId: row.test_id,
    studentId: row.student_id,
    scanPageId: row.scan_page_id,
    layoutVersion: row.layout_version,
    rawAnswers: parseAnswers(row.raw_answers_json),
    finalAnswers: parseAnswers(row.final_answers_json),
    correctCount: row.correct_count,
    possibleCount: row.possible_count,
    flags: parseFlags(row.flags_json),
    reviewed: row.reviewed === 1,
    gradedAt: row.graded_at,
    updatedAt: row.updated_at
  }
}

export interface ResultInsert {
  testId: number
  studentId: number
  scanPageId: number | null
  layoutVersion: number
  rawAnswers: (number | null)[]
  finalAnswers: (number | null)[]
  correctCount: number
  possibleCount: number
  flags: QuestionFlag[]
}

export class ResultRepository {
  constructor(private readonly db: Db) {}

  findByPair(testId: number, studentId: number): GradeResult | null {
    const row = this.db.prepare('SELECT * FROM results WHERE test_id = ? AND student_id = ?').get(testId, studentId) as ResultRow | undefined
    return row ? toResult(row) : null
  }

  findById(id: number): GradeResult | null {
    const row = this.db.prepare('SELECT * FROM results WHERE id = ?').get(id) as ResultRow | undefined
    return row ? toResult(row) : null
  }

  listByTest(testId: number): GradeResult[] {
    const rows = this.db.prepare('SELECT * FROM results WHERE test_id = ? ORDER BY id').all(testId) as ResultRow[]
    return rows.map(toResult)
  }

  insert(input: ResultInsert): GradeResult {
    const ts = nowIso()
    const info = this.db
      .prepare(
        `INSERT INTO results (test_id, student_id, scan_page_id, layout_version, raw_answers_json, final_answers_json,
           correct_count, possible_count, flags_json, reviewed, graded_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        input.testId,
        input.studentId,
        input.scanPageId,
        input.layoutVersion,
        JSON.stringify(input.rawAnswers),
        JSON.stringify(input.finalAnswers),
        input.correctCount,
        input.possibleCount,
        JSON.stringify(input.flags),
        ts,
        ts
      )
    const result = this.findById(Number(info.lastInsertRowid))
    if (!result) throw new Error('Result insert failed')
    return result
  }

  /** Delete results that came from pages of a batch (used when a batch is removed). */
  deleteByBatch(batchId: number): number {
    return this.db
      .prepare('DELETE FROM results WHERE scan_page_id IN (SELECT id FROM scan_pages WHERE batch_id = ?)')
      .run(batchId).changes
  }
}
