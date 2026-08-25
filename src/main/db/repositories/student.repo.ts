import type { Db } from '../database'
import { nowIso } from '../database'
import type { Student } from '@shared/types'
import { generateCode } from '@shared/codes'

interface StudentRow {
  id: number
  section_id: number
  code: string
  last_name: string
  first_name: string
  student_number: string | null
  active: number
  result_count: number
  created_at: string
  updated_at: string
}

const SELECT = `
  SELECT st.id, st.section_id, st.code, st.last_name, st.first_name, st.student_number, st.active,
    st.created_at, st.updated_at,
    (SELECT COUNT(*) FROM results r WHERE r.student_id = st.id) AS result_count
  FROM students st`

const ORDER = ' ORDER BY st.last_name COLLATE NOCASE, st.first_name COLLATE NOCASE, st.id'

const CODE_ATTEMPTS = 20

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    sectionId: row.section_id,
    code: row.code,
    lastName: row.last_name,
    firstName: row.first_name,
    studentNumber: row.student_number,
    active: row.active === 1,
    resultCount: row.result_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface StudentInsert {
  sectionId: number
  lastName: string
  firstName: string
  studentNumber: string | null
}

export interface StudentPatch {
  lastName?: string
  firstName?: string
  studentNumber?: string | null
  active?: boolean
  sectionId?: number
}

export class StudentRepository {
  constructor(
    private readonly db: Db,
    private readonly newCode: () => string = generateCode
  ) {}

  listBySection(sectionId: number, includeInactive: boolean): Student[] {
    const where = includeInactive ? ' WHERE st.section_id = ?' : ' WHERE st.section_id = ? AND st.active = 1'
    const rows = this.db.prepare(`${SELECT}${where}${ORDER}`).all(sectionId) as StudentRow[]
    return rows.map(toStudent)
  }

  /** Every student in every section, active or not (the scan pipeline resolves QR codes against this). */
  listAll(): Student[] {
    const rows = this.db.prepare(`${SELECT}${ORDER}`).all() as StudentRow[]
    return rows.map(toStudent)
  }

  findById(id: number): Student | null {
    const row = this.db.prepare(`${SELECT} WHERE st.id = ?`).get(id) as StudentRow | undefined
    return row ? toStudent(row) : null
  }

  findByCode(code: string): Student | null {
    const row = this.db.prepare(`${SELECT} WHERE st.code = ?`).get(code) as StudentRow | undefined
    return row ? toStudent(row) : null
  }

  /** Insert with a fresh short code, retrying on the rare code collision. */
  insert(input: StudentInsert): Student {
    const ts = nowIso()
    const stmt = this.db.prepare(
      `INSERT INTO students (section_id, code, last_name, first_name, student_number, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = this.newCode()
      try {
        const info = stmt.run(input.sectionId, code, input.lastName, input.firstName, input.studentNumber, ts, ts)
        const created = this.findById(Number(info.lastInsertRowid))
        if (!created) throw new Error('Student insert failed')
        return created
      } catch (err) {
        if (!isCodeCollision(err)) throw err
      }
    }
    throw new Error('Could not generate a unique student code')
  }

  /** Insert many rows in one transaction. */
  insertMany(inputs: StudentInsert[]): Student[] {
    const run = this.db.transaction((items: StudentInsert[]) => items.map((item) => this.insert(item)))
    return run(inputs)
  }

  update(id: number, patch: StudentPatch): Student | null {
    const sets: string[] = []
    const params: unknown[] = []
    if (patch.lastName !== undefined) {
      sets.push('last_name = ?')
      params.push(patch.lastName)
    }
    if (patch.firstName !== undefined) {
      sets.push('first_name = ?')
      params.push(patch.firstName)
    }
    if (patch.studentNumber !== undefined) {
      sets.push('student_number = ?')
      params.push(patch.studentNumber)
    }
    if (patch.active !== undefined) {
      sets.push('active = ?')
      params.push(patch.active ? 1 : 0)
    }
    if (patch.sectionId !== undefined) {
      sets.push('section_id = ?')
      params.push(patch.sectionId)
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?')
      params.push(nowIso())
      params.push(id)
      this.db.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    return this.findById(id)
  }

  delete(id: number): boolean {
    const info = this.db.prepare('DELETE FROM students WHERE id = ?').run(id)
    return info.changes > 0
  }
}

function isCodeCollision(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const code = (err as { code?: unknown }).code
  return code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('students.code')
}
