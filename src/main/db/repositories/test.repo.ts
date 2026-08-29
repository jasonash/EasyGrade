import type { Db } from '../database'
import { nowIso } from '../database'
import type { LabelStyle, StoredQuestion, Test, TestAttachment, TestKind, TestStatus, TestSummary } from '@shared/types'
import { SheetLayoutSchema, TestAttachmentSchema } from '@shared/schemas'
import { generateCode } from '@shared/codes'

interface TestRow {
  id: number
  section_id: number
  section_name: string
  school_year: string
  code: string
  kind: string
  title: string
  instructions: string | null
  status: string
  default_choice_count: number | null
  link_url: string | null
  attachment_json: string | null
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
  label_style: string
  count_overridden: number
}

interface ChoiceRow {
  question_id: number
  position: number
  text: string
}

const SELECT = `
  SELECT t.id, t.section_id, s.name AS section_name, s.school_year, t.code, t.kind, t.title, t.instructions, t.status,
    t.default_choice_count, t.link_url, t.attachment_json,
    t.layout_version, t.layout_json, t.finalized_at, t.last_printed_at, t.created_at, t.updated_at,
    (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS question_count,
    (SELECT COUNT(*) FROM results r WHERE r.test_id = t.id) AS result_count,
    (SELECT COUNT(*) FROM students st WHERE st.section_id = t.section_id AND st.active = 1) AS active_student_count
  FROM tests t JOIN sections s ON s.id = t.section_id`

const CODE_ATTEMPTS = 20

function toStatus(value: string): TestStatus {
  return value === 'finalized' ? 'finalized' : 'draft'
}

function toKind(value: string): TestKind {
  return value === 'answer_sheet' ? 'answer_sheet' : 'standard'
}

function toLabelStyle(value: string): LabelStyle {
  return value === 'true_false' ? 'true_false' : 'letters'
}

function parseAttachment(json: string | null): TestAttachment | null {
  if (json === null) return null
  try {
    const result = TestAttachmentSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function toSummary(row: TestRow): TestSummary {
  return {
    id: row.id,
    sectionId: row.section_id,
    sectionName: row.section_name,
    schoolYear: row.school_year,
    code: row.code,
    kind: toKind(row.kind),
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
  /** Defaults to letters. */
  labelStyle?: LabelStyle
  countOverridden?: boolean
}

export interface TestInsert {
  sectionId: number
  /** Defaults to standard. */
  kind?: TestKind
  title: string
  instructions: string
  defaultChoiceCount?: number | null
  linkUrl?: string | null
  questions: QuestionInsert[]
}

export interface TestPatch {
  title?: string
  instructions?: string
  linkUrl?: string | null
  defaultChoiceCount?: number | null
  attachmentJson?: string | null
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
    return rows.map((row) => this.toTest(row))
  }

  findById(id: number): Test | null {
    const row = this.db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as TestRow | undefined
    return row ? this.toTest(row) : null
  }

  private toTest(row: TestRow): Test {
    return {
      ...toSummary(row),
      instructions: row.instructions ?? '',
      defaultChoiceCount: row.default_choice_count,
      linkUrl: row.link_url,
      attachment: parseAttachment(row.attachment_json),
      layout: parseLayout(row.layout_json),
      finalizedAt: row.finalized_at,
      questions: this.questionsFor(row.id),
      createdAt: row.created_at
    }
  }

  private questionsFor(testId: number): StoredQuestion[] {
    const questions = this.db
      .prepare(
        'SELECT id, position, stem, correct_choice, points, label_style, count_overridden FROM questions WHERE test_id = ? ORDER BY position'
      )
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
      points: q.points,
      labelStyle: toLabelStyle(q.label_style),
      countOverridden: q.count_overridden === 1
    }))
  }

  insert(input: TestInsert): Test {
    const ts = nowIso()
    const stmt = this.db.prepare(
      `INSERT INTO tests (section_id, code, kind, title, instructions, default_choice_count, link_url, status, layout_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)`
    )
    const run = this.db.transaction((): number => {
      for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
        const code = this.newCode()
        try {
          const info = stmt.run(
            input.sectionId,
            code,
            input.kind ?? 'standard',
            input.title,
            input.instructions,
            input.defaultChoiceCount ?? null,
            input.linkUrl ?? null,
            ts,
            ts
          )
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
      'INSERT INTO questions (test_id, position, stem, correct_choice, points, label_style, count_overridden) VALUES (?, ?, ?, ?, 1, ?, ?)'
    )
    const insertChoice = this.db.prepare('INSERT INTO choices (question_id, position, text) VALUES (?, ?, ?)')
    questions.forEach((q, position) => {
      const info = insertQuestion.run(testId, position, q.stem, q.correctChoice, q.labelStyle ?? 'letters', q.countOverridden ? 1 : 0)
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
    if (patch.linkUrl !== undefined) add('link_url', patch.linkUrl)
    if (patch.defaultChoiceCount !== undefined) add('default_choice_count', patch.defaultChoiceCount)
    if (patch.attachmentJson !== undefined) add('attachment_json', patch.attachmentJson)
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
