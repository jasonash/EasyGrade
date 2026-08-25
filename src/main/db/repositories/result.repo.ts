import type { Db } from '../database'
import { nowIso } from '../database'
import type { AnswerOverride, GradeResult, QuestionFlag } from '@shared/schemas'

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

interface OverrideRow {
  result_id: number
  question_position: number
  raw_choice: number | null
  override_choice: number | null
  note: string | null
}

function toOverride(row: OverrideRow): AnswerOverride {
  return { q: row.question_position, rawChoice: row.raw_choice, overrideChoice: row.override_choice, note: row.note }
}

function toResult(row: ResultRow, overrides: AnswerOverride[]): GradeResult {
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
    overrides,
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

export interface ScorePatch {
  finalAnswers: (number | null)[]
  correctCount: number
  possibleCount: number
  flags: QuestionFlag[]
}

export class ResultRepository {
  constructor(private readonly db: Db) {}

  findByPair(testId: number, studentId: number): GradeResult | null {
    const row = this.db.prepare('SELECT * FROM results WHERE test_id = ? AND student_id = ?').get(testId, studentId) as ResultRow | undefined
    return row ? this.hydrate(row) : null
  }

  findById(id: number): GradeResult | null {
    const row = this.db.prepare('SELECT * FROM results WHERE id = ?').get(id) as ResultRow | undefined
    return row ? this.hydrate(row) : null
  }

  findByPage(scanPageId: number): GradeResult | null {
    const row = this.db.prepare('SELECT * FROM results WHERE scan_page_id = ?').get(scanPageId) as ResultRow | undefined
    return row ? this.hydrate(row) : null
  }

  listByTest(testId: number): GradeResult[] {
    const rows = this.db.prepare('SELECT * FROM results WHERE test_id = ? ORDER BY id').all(testId) as ResultRow[]
    return this.hydrateAll(rows)
  }

  listByStudent(studentId: number): GradeResult[] {
    const rows = this.db.prepare('SELECT * FROM results WHERE student_id = ? ORDER BY graded_at DESC, id DESC').all(studentId) as ResultRow[]
    return this.hydrateAll(rows)
  }

  private hydrate(row: ResultRow): GradeResult {
    const overrides = this.db
      .prepare('SELECT * FROM answer_overrides WHERE result_id = ? ORDER BY question_position')
      .all(row.id) as OverrideRow[]
    return toResult(row, overrides.map(toOverride))
  }

  private hydrateAll(rows: ResultRow[]): GradeResult[] {
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const overrides = this.db
      .prepare(`SELECT * FROM answer_overrides WHERE result_id IN (${ids.map(() => '?').join(',')}) ORDER BY question_position`)
      .all(...ids) as OverrideRow[]
    const byResult = new Map<number, AnswerOverride[]>()
    for (const o of overrides) {
      const list = byResult.get(o.result_id) ?? []
      list.push(toOverride(o))
      byResult.set(o.result_id, list)
    }
    return rows.map((row) => toResult(row, byResult.get(row.id) ?? []))
  }

  /** Store the recomputed final answers, score, and flags. */
  updateScore(id: number, patch: ScorePatch): void {
    this.db
      .prepare('UPDATE results SET final_answers_json = ?, correct_count = ?, possible_count = ?, flags_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(patch.finalAnswers), patch.correctCount, patch.possibleCount, JSON.stringify(patch.flags), nowIso(), id)
  }

  setReviewed(id: number, reviewed: boolean): void {
    this.db.prepare('UPDATE results SET reviewed = ?, updated_at = ? WHERE id = ?').run(reviewed ? 1 : 0, nowIso(), id)
  }

  /** Insert or replace the teacher's decision for one question. */
  upsertOverride(resultId: number, override: AnswerOverride): void {
    this.db
      .prepare(
        `INSERT INTO answer_overrides (result_id, question_position, raw_choice, override_choice, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (result_id, question_position) DO UPDATE SET
           raw_choice = excluded.raw_choice, override_choice = excluded.override_choice,
           note = excluded.note, created_at = excluded.created_at`
      )
      .run(resultId, override.q, override.rawChoice, override.overrideChoice, override.note, nowIso())
  }

  deleteOverride(resultId: number, q: number): boolean {
    return this.db.prepare('DELETE FROM answer_overrides WHERE result_id = ? AND question_position = ?').run(resultId, q).changes > 0
  }

  /** Delete one result (overrides cascade) and unlink the page that produced it. */
  delete(id: number): boolean {
    const run = this.db.transaction((): boolean => {
      this.db.prepare('UPDATE scan_pages SET result_id = NULL WHERE result_id = ?').run(id)
      return this.db.prepare('DELETE FROM results WHERE id = ?').run(id).changes > 0
    })
    return run()
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
