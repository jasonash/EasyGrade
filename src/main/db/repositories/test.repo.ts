import type { Db } from '../database'
import { nowIso } from '../database'
import type { StoredQuestion, Test, TestStatus, TestSummary } from '@shared/types'
import { SheetLayoutSchema } from '@shared/schemas'
import { generateCode } from '@shared/codes'

interface TestRow {
  id: number
  section_id: number
  section_name: string
  school_year: string
  code: string
  title: string
  instructions: string | null
  status: string
  layout_version: number
  layout_json: string | null
  finalized_at: string | null
  last_printed_at: string | null
  question_count: number
  result_count: number
  active_student_count: number
  created_at: string
  updated_at: string
}

interface QuestionRow {
  id: number
  position: number
  stem: string
  correct_choice: number
  points: number
}

interface ChoiceRow {
  question_id: number
  position: number
  text: string
}

const SELECT = `
  SELECT t.id, t.section_id, s.name AS section_name, s.school_year, t.code, t.title, t.instructions, t.status,
    t.layout_version, t.layout_json, t.finalized_at, t.last_printed_at, t.created_at, t.updated_at,
    (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS question_count,
    (SELECT COUNT(*) FROM results r WHERE r.test_id = t.id) AS result_count,
    (SELECT COUNT(*) FROM students st WHERE st.section_id = t.section_id AND st.active = 1) AS active_student_count
  FROM tests t JOIN sections s ON s.id = t.section_id`

const CODE_ATTEMPTS = 20

function toStatus(value: string): TestStatus {
  return value === 'finalized' ? 'finalized' : 'draft'
}

function toSummary(row: TestRow): TestSummary {
  return {
    id: row.id,
    sectionId: row.section_id,
    sectionName: row.section_name,
    schoolYear: row.school_year,
    code: row.code,
    title: row.title,
    status: toStatus(row.status),
    questionCount: row.question_count,
    layoutVersion: row.layout_version,
    lastPrintedAt: row.last_printed_at,
    resultCount: row.result_count,
    activeStudentCount: row.active_student_count,
    updatedAt: row.updated_at
  }
}

function parseLayout(json: string | null): Test['layout'] {
  if (json === null) return null
  try {
    const result = SheetLayoutSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export interface QuestionInsert {
  stem: string
  choices: string[]
  correctChoice: number
}

export interface TestInsert {
  sectionId: number
  title: string
  instructions: string
  questions: QuestionInsert[]
}

export interface TestPatch {
  title?: string
  instructions?: string
  status?: TestStatus
  layoutVersion?: number
  layoutJson?: string | null
  finalizedAt?: string | null
  lastPrintedAt?: string | null
}

export class TestRepository {
  constructor(
    private readonly db: Db,
    private readonly newCode: () => string = generateCode
  ) {}

  list(sectionId?: number): TestSummary[] {
    const where = sectionId === undefined ? '' : ' WHERE t.section_id = ?'
    const stmt = this.db.prepare(`${SELECT}${where} ORDER BY t.updated_at DESC, t.id DESC`)
    const rows = (sectionId === undefined ? stmt.all() : stmt.all(sectionId)) as TestRow[]
    return rows.map(toSummary)
  }

  /** Finalized tests with their stored layouts (what a scanned QR can refer to). */
  listFinalized(): Test[] {
    const rows = this.db.prepare(`${SELECT} WHERE t.status = 'finalized' ORDER BY t.id`).all() as TestRow[]
    return rows.map((row) => ({
      ...toSummary(row),
      instructions: row.instructions ?? '',
      layout: parseLayout(row.layout_json),
      finalizedAt: row.finalized_at,
      questions: this.questionsFor(row.id),
      createdAt: row.created_at
    }))
  }

  findById(id: number): Test | null {
    const row = this.db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as TestRow | undefined
    if (!row) return null
    return {
      ...toSummary(row),
      instructions: row.instructions ?? '',
      layout: parseLayout(row.layout_json),
      finalizedAt: row.finalized_at,
      questions: this.questionsFor(id),
      createdAt: row.created_at
    }
  }

  private questionsFor(testId: number): StoredQuestion[] {
    const questions = this.db
      .prepare('SELECT id, position, stem, correct_choice, points FROM questions WHERE test_id = ? ORDER BY position')
      .all(testId) as QuestionRow[]
    const choices = this.db
      .prepare(
        `SELECT c.question_id, c.position, c.text FROM choices c
         JOIN questions q ON q.id = c.question_id WHERE q.test_id = ? ORDER BY c.question_id, c.position`
      )
      .all(testId) as ChoiceRow[]
    const byQuestion = new Map<number, string[]>()
    for (const c of choices) {
      const list = byQuestion.get(c.question_id) ?? []
      list[c.position] = c.text
      byQuestion.set(c.question_id, list)
    }
    return questions.map((q) => ({
      id: q.id,
      position: q.position,
      stem: q.stem,
      choices: byQuestion.get(q.id) ?? [],
      correctChoice: q.correct_choice,
      points: q.points
    }))
  }

  insert(input: TestInsert): Test {
    const ts = nowIso()
    const stmt = this.db.prepare(
      `INSERT INTO tests (section_id, code, title, instructions, status, layout_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', 1, ?, ?)`
    )
    const run = this.db.transaction((): number => {
      for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
        const code = this.newCode()
        try {
          const info = stmt.run(input.sectionId, code, input.title, input.instructions, ts, ts)
          const id = Number(info.lastInsertRowid)
          this.writeQuestions(id, input.questions)
          return id
        } catch (err) {
          if (!isCodeCollision(err)) throw err
        }
      }
      throw new Error('Could not generate a unique test code')
    })
    const id = run()
    const created = this.findById(id)
    if (!created) throw new Error('Test insert failed')
    return created
  }

  /** Replace every question and choice of a test in one transaction. */
  replaceQuestions(testId: number, questions: QuestionInsert[]): void {
    const run = this.db.transaction(() => {
      this.db.prepare('DELETE FROM questions WHERE test_id = ?').run(testId)
      this.writeQuestions(testId, questions)
      this.db.prepare('UPDATE tests SET updated_at = ? WHERE id = ?').run(nowIso(), testId)
    })
    run()
  }

  private writeQuestions(testId: number, questions: QuestionInsert[]): void {
    const insertQuestion = this.db.prepare(
      'INSERT INTO questions (test_id, position, stem, correct_choice, points) VALUES (?, ?, ?, ?, 1)'
    )
    const insertChoice = this.db.prepare('INSERT INTO choices (question_id, position, text) VALUES (?, ?, ?)')
    questions.forEach((q, position) => {
      const info = insertQuestion.run(testId, position, q.stem, q.correctChoice)
      const questionId = Number(info.lastInsertRowid)
      q.choices.forEach((text, i) => insertChoice.run(questionId, i, text))
    })
  }

  updateKey(testId: number, correctChoices: number[]): void {
    const stmt = this.db.prepare('UPDATE questions SET correct_choice = ? WHERE test_id = ? AND position = ?')
    const run = this.db.transaction(() => {
      correctChoices.forEach((choice, position) => stmt.run(choice, testId, position))
      this.db.prepare('UPDATE tests SET updated_at = ? WHERE id = ?').run(nowIso(), testId)
    })
    run()
  }

  update(id: number, patch: TestPatch): Test | null {
    const sets: string[] = []
    const params: unknown[] = []
    const add = (column: string, value: unknown): void => {
      sets.push(`${column} = ?`)
      params.push(value)
    }
    if (patch.title !== undefined) add('title', patch.title)
    if (patch.instructions !== undefined) add('instructions', patch.instructions)
    if (patch.status !== undefined) add('status', patch.status)
    if (patch.layoutVersion !== undefined) add('layout_version', patch.layoutVersion)
    if (patch.layoutJson !== undefined) add('layout_json', patch.layoutJson)
    if (patch.finalizedAt !== undefined) add('finalized_at', patch.finalizedAt)
    if (patch.lastPrintedAt !== undefined) add('last_printed_at', patch.lastPrintedAt)
    if (sets.length > 0) {
      add('updated_at', nowIso())
      params.push(id)
      this.db.prepare(`UPDATE tests SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    return this.findById(id)
  }

  delete(id: number): boolean {
    const info = this.db.prepare('DELETE FROM tests WHERE id = ?').run(id)
    return info.changes > 0
  }
}

function isCodeCollision(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const code = (err as { code?: unknown }).code
  return code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('tests.code')
}
