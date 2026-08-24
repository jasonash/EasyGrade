import type { Db } from '../database'
import { nowIso } from '../database'
import type { Section } from '@shared/types'

interface SectionRow {
  id: number
  name: string
  school_year: string
  archived: number
  student_count: number
  test_count: number
  created_at: string
  updated_at: string
}

const SELECT = `
  SELECT s.id, s.name, s.school_year, s.archived, s.created_at, s.updated_at,
    (SELECT COUNT(*) FROM students st WHERE st.section_id = s.id AND st.active = 1) AS student_count,
    (SELECT COUNT(*) FROM tests t WHERE t.section_id = s.id) AS test_count
  FROM sections s`

function toSection(row: SectionRow): Section {
  return {
    id: row.id,
    name: row.name,
    schoolYear: row.school_year,
    archived: row.archived === 1,
    studentCount: row.student_count,
    testCount: row.test_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class SectionRepository {
  constructor(private readonly db: Db) {}

  list(includeArchived: boolean): Section[] {
    const where = includeArchived ? '' : ' WHERE s.archived = 0'
    const rows = this.db.prepare(`${SELECT}${where} ORDER BY s.school_year DESC, s.name COLLATE NOCASE`).all() as SectionRow[]
    return rows.map(toSection)
  }

  findById(id: number): Section | null {
    const row = this.db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as SectionRow | undefined
    return row ? toSection(row) : null
  }

  insert(name: string, schoolYear: string): Section {
    const ts = nowIso()
    const info = this.db
      .prepare('INSERT INTO sections (name, school_year, archived, created_at, updated_at) VALUES (?, ?, 0, ?, ?)')
      .run(name, schoolYear, ts, ts)
    const created = this.findById(Number(info.lastInsertRowid))
    if (!created) throw new Error('Section insert failed')
    return created
  }

  update(id: number, patch: { name?: string; schoolYear?: string; archived?: boolean }): Section | null {
    const sets: string[] = []
    const params: unknown[] = []
    if (patch.name !== undefined) {
      sets.push('name = ?')
      params.push(patch.name)
    }
    if (patch.schoolYear !== undefined) {
      sets.push('school_year = ?')
      params.push(patch.schoolYear)
    }
    if (patch.archived !== undefined) {
      sets.push('archived = ?')
      params.push(patch.archived ? 1 : 0)
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?')
      params.push(nowIso())
      params.push(id)
      this.db.prepare(`UPDATE sections SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    return this.findById(id)
  }

  delete(id: number): boolean {
    const info = this.db.prepare('DELETE FROM sections WHERE id = ?').run(id)
    return info.changes > 0
  }

  schoolYears(): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT school_year FROM sections WHERE school_year <> '' ORDER BY school_year DESC`)
      .all() as { school_year: string }[]
    return rows.map((r) => r.school_year)
  }
}
