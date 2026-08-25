import { describe, expect, it, beforeEach } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { StudentRepository } from '../../src/main/db/repositories/student.repo'
import { SectionService } from '../../src/main/services/section.service'
import { StudentService } from '../../src/main/services/student.service'
import { AppError } from '../../src/main/services/errors'
import { CODE_REGEX } from '../../src/shared/codes'

describe('StudentService', () => {
  let db: Db
  let sections: SectionService
  let service: StudentService
  let sectionId: number
  let otherSectionId: number

  beforeEach(() => {
    db = openDatabase({ path: ':memory:' })
    const sectionRepo = new SectionRepository(db)
    sections = new SectionService(sectionRepo)
    service = new StudentService(new StudentRepository(db), sectionRepo)
    sectionId = sections.create({ name: 'First Block', schoolYear: '2026-27' }).id
    otherSectionId = sections.create({ name: 'Third Block', schoolYear: '2026-27' }).id
  })

  it('creates students with unique short codes and trims input', () => {
    const a = service.create({ sectionId, lastName: ' Adams ', firstName: 'Maria', studentNumber: ' 100234 ' })
    const b = service.create({ sectionId, lastName: 'Baker', firstName: 'Devon', studentNumber: '' })
    expect(a.code).toMatch(CODE_REGEX)
    expect(b.code).toMatch(CODE_REGEX)
    expect(a.code).not.toBe(b.code)
    expect(a).toMatchObject({ lastName: 'Adams', firstName: 'Maria', studentNumber: '100234', active: true })
    expect(b.studentNumber).toBeNull()
    expect(sections.get(sectionId).studentCount).toBe(2)
  })

  it('retries when a generated code collides', () => {
    const codes = ['AAAAAA', 'AAAAAA', 'AAAAAA', 'BBBBBB']
    const repo = new StudentRepository(db, () => codes.shift() ?? 'CCCCCC')
    const first = repo.insert({ sectionId, lastName: 'A', firstName: 'A', studentNumber: null })
    const second = repo.insert({ sectionId, lastName: 'B', firstName: 'B', studentNumber: null })
    expect(first.code).toBe('AAAAAA')
    expect(second.code).toBe('BBBBBB')
  })

  it('gives up after repeated collisions instead of looping forever', () => {
    const repo = new StudentRepository(db, () => 'AAAAAA')
    repo.insert({ sectionId, lastName: 'A', firstName: 'A', studentNumber: null })
    expect(() => repo.insert({ sectionId, lastName: 'B', firstName: 'B', studentNumber: null })).toThrow(
      /unique student code/
    )
  })

  it('lists by section sorted by last then first name, hiding inactive by default', () => {
    service.create({ sectionId, lastName: 'baker', firstName: 'Zed' })
    service.create({ sectionId, lastName: 'Adams', firstName: 'Maria' })
    const inactive = service.create({ sectionId, lastName: 'Baker', firstName: 'Ann' })
    service.create({ sectionId: otherSectionId, lastName: 'Aaron', firstName: 'Other' })
    service.deactivate(inactive.id)

    expect(service.listBySection(sectionId).map((s) => `${s.lastName} ${s.firstName}`)).toEqual([
      'Adams Maria',
      'baker Zed'
    ])
    expect(service.listBySection(sectionId, true).map((s) => `${s.lastName} ${s.firstName}`)).toEqual([
      'Adams Maria',
      'Baker Ann',
      'baker Zed'
    ])
    expect(sections.get(sectionId).studentCount).toBe(2)
  })

  it('updates, deactivates, and reactivates', () => {
    const s = service.create({ sectionId, lastName: 'Adams', firstName: 'Maria', studentNumber: '1' })
    const updated = service.update({ id: s.id, firstName: 'Marie', studentNumber: '' })
    expect(updated).toMatchObject({ firstName: 'Marie', lastName: 'Adams', studentNumber: null })
    expect(service.deactivate(s.id).active).toBe(false)
    expect(service.reactivate(s.id).active).toBe(true)
  })

  it('moves a student between sections and keeps the code', () => {
    const s = service.create({ sectionId, lastName: 'Adams', firstName: 'Maria' })
    const moved = service.move({ id: s.id, sectionId: otherSectionId })
    expect(moved.sectionId).toBe(otherSectionId)
    expect(moved.code).toBe(s.code)
    expect(service.listBySection(sectionId)).toHaveLength(0)
    expect(service.listBySection(otherSectionId)).toHaveLength(1)
  })

  it('rejects unknown sections and students with NOT_FOUND', () => {
    expect(() => service.create({ sectionId: 999, lastName: 'A', firstName: 'B' })).toThrowError(AppError)
    expect(() => service.listBySection(999)).toThrowError(/Section 999/)
    expect(() => service.get(999)).toThrowError(/Student 999/)
    const s = service.create({ sectionId, lastName: 'A', firstName: 'B' })
    expect(() => service.move({ id: s.id, sectionId: 999 })).toThrowError(/Section 999/)
  })

  it('removes students without results and refuses when results exist', () => {
    const s = service.create({ sectionId, lastName: 'Adams', firstName: 'Maria' })
    const t = service.create({ sectionId, lastName: 'Baker', firstName: 'Devon' })
    service.remove(s.id)
    expect(service.listBySection(sectionId)).toHaveLength(1)

    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO tests (section_id, code, title, created_at, updated_at) VALUES (?, 'TESTAA', 'Quiz', ?, ?)`
    ).run(sectionId, ts, ts)
    db.prepare(
      `INSERT INTO results (test_id, student_id, layout_version, raw_answers_json, final_answers_json,
         correct_count, possible_count, graded_at, updated_at)
       VALUES (1, ?, 1, '[]', '[]', 0, 0, ?, ?)`
    ).run(t.id, ts, ts)
    try {
      service.remove(t.id)
      expect.fail('expected throw')
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT')
    }
    expect(service.get(t.id).resultCount).toBe(1)
  })

  it('previews an import against the current roster, including inactive students', () => {
    service.create({ sectionId, lastName: 'Adams', firstName: 'Maria', studentNumber: '100234' })
    const gone = service.create({ sectionId, lastName: 'Old', firstName: 'Student' })
    service.deactivate(gone.id)
    service.create({ sectionId: otherSectionId, lastName: 'Baker', firstName: 'Devon' })

    const preview = service.importPreview({
      sectionId,
      text: 'last_name,first_name,student_number\nBaker,Devon,100251\nAdams,Maria,\nOld,Student,\n,Nobody,\n'
    })
    expect(preview.counts).toEqual({ new: 1, duplicate: 2, error: 1 })
    expect(preview.rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'duplicate', 'error'])
  })

  it('surfaces parser-level errors as VALIDATION', () => {
    try {
      service.importPreview({ sectionId, text: '\n' })
      expect.fail('expected throw')
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION')
    }
  })

  it('commits rows in one transaction and assigns codes', () => {
    const result = service.importCommit({
      sectionId,
      rows: [
        { lastName: 'Adams', firstName: 'Maria', studentNumber: '100234' },
        { lastName: 'Baker', firstName: 'Devon', studentNumber: null },
        { lastName: 'Cruz', firstName: 'Ana', studentNumber: '' }
      ]
    })
    expect(result.created).toBe(3)
    const roster = service.listBySection(sectionId)
    expect(roster.map((s) => s.lastName)).toEqual(['Adams', 'Baker', 'Cruz'])
    expect(new Set(roster.map((s) => s.code)).size).toBe(3)
    expect(roster[2]?.studentNumber).toBeNull()
    expect(service.importCommit({ sectionId, rows: [] }).created).toBe(0)
  })

  it('rejects invalid commit rows without inserting anything', () => {
    expect(() =>
      service.importCommit({ sectionId, rows: [{ lastName: '', firstName: 'X', studentNumber: null }] })
    ).toThrow()
    expect(service.listBySection(sectionId)).toHaveLength(0)
  })

  it('serves the CSV template', () => {
    expect(service.template().startsWith('last_name,first_name,student_number\n')).toBe(true)
  })
})
