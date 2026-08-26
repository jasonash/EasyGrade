import { describe, expect, it, beforeEach } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { StudentRepository } from '../../src/main/db/repositories/student.repo'
import { TestRepository } from '../../src/main/db/repositories/test.repo'
import { SectionService } from '../../src/main/services/section.service'
import { StudentService } from '../../src/main/services/student.service'
import { DEFAULT_TITLE, TestService } from '../../src/main/services/test.service'
import { AppError } from '../../src/main/services/errors'
import { CODE_REGEX } from '../../src/shared/codes'
import { DEFAULT_INSTRUCTIONS } from '../../src/shared/schemas'

const q = (stem: string, correct = 1) => ({ stem, choices: ['Positive', 'Negative', 'Neutral', 'Varies'], correctChoice: correct })

describe('TestService', () => {
  let db: Db
  let service: TestService
  let students: StudentService
  let sectionId: number
  let otherSectionId: number

  beforeEach(() => {
    db = openDatabase({ path: ':memory:' })
    const sectionRepo = new SectionRepository(db)
    const sections = new SectionService(sectionRepo)
    students = new StudentService(new StudentRepository(db), sectionRepo)
    service = new TestService(new TestRepository(db), sectionRepo)
    sectionId = sections.create({ name: 'First Block', schoolYear: '2026-27' }).id
    otherSectionId = sections.create({ name: 'Third Block', schoolYear: '2026-27' }).id
  })

  it('creates a draft with default instructions, a blank question, a code, and section info', () => {
    const test = service.create({ sectionId, title: '  ' })
    expect(test.title).toBe(DEFAULT_TITLE)
    expect(test.instructions).toBe(DEFAULT_INSTRUCTIONS)
    expect(test.code).toMatch(CODE_REGEX)
    expect(test.status).toBe('draft')
    expect(test.layout).toBeNull()
    expect(test.layoutVersion).toBe(1)
    expect(test.sectionName).toBe('First Block')
    expect(test.schoolYear).toBe('2026-27')
    expect(test.questions).toEqual([
      { id: expect.any(Number), position: 0, stem: '', choices: ['', '', '', ''], correctChoice: 0, points: 1 }
    ])
  })

  it('replaces questions on update and trims text', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    const updated = service.update({
      id: test.id,
      title: ' Unit 3 Quiz ',
      instructions: ' Use pencil. ',
      questions: [q(' What is the charge of an electron? '), { stem: 'Two', choices: [' a ', 'b'], correctChoice: 1 }]
    })
    expect(updated.title).toBe('Unit 3 Quiz')
    expect(updated.instructions).toBe('Use pencil.')
    expect(updated.questions.map((x) => x.stem)).toEqual(['What is the charge of an electron?', 'Two'])
    expect(updated.questions[1]?.choices).toEqual(['a', 'b'])
    expect(updated.questions.map((x) => x.position)).toEqual([0, 1])
    const orphanChoices = db.prepare('SELECT COUNT(*) AS n FROM choices').get() as { n: number }
    expect(orphanChoices.n).toBe(6)
  })

  it('rejects a key outside the choices and too many questions', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    expect(() =>
      service.update({ id: test.id, title: 'Q', instructions: '', questions: [{ stem: 'x', choices: ['a', 'b'], correctChoice: 2 }] })
    ).toThrow()
    expect(() =>
      service.update({ id: test.id, title: 'Q', instructions: '', questions: new Array(11).fill(q('x')) })
    ).toThrow()
  })

  it('refuses to finalize with blank text and says where', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    try {
      service.finalize(test.id)
      expect.fail('expected throw')
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION')
      expect((err as AppError).message).toBe('Question 1: Question text is required')
    }
    service.update({ id: test.id, title: 'Quiz', instructions: '', questions: [{ stem: 'ok', choices: ['a', ''], correctChoice: 0 }] })
    expect(() => service.finalize(test.id)).toThrow('Question 1, choice B: Choice text is required')
  })

  it('refuses to finalize a test that overflows its slots', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    const long = q('word '.repeat(48).trim())
    service.update({ id: test.id, title: 'Quiz', instructions: '', questions: [...new Array(9).fill(q('short')), long] })
    try {
      service.finalize(test.id)
      expect.fail('expected throw')
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION')
      expect((err as AppError).message).toMatch(/does not fit on one page.*Question 10/)
    }
    expect(service.get(test.id).status).toBe('draft')
  })

  it('finalizes, stores the layout, locks text, and bumps the version on re-finalize', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    service.update({ id: test.id, title: 'Quiz', instructions: '', questions: [q('One'), q('Two'), { stem: 'Three', choices: ['a', 'b'], correctChoice: 0 }] })
    const finalized = service.finalize(test.id)
    expect(finalized.status).toBe('finalized')
    expect(finalized.layoutVersion).toBe(1)
    expect(finalized.finalizedAt).not.toBeNull()
    expect(finalized.layout).toMatchObject({ questionCount: 3, choiceCounts: [4, 4, 2], slotHeight: 181, fontSize: 11 })

    expect(() => service.update({ id: test.id, title: 'X', instructions: '', questions: [q('One')] })).toThrow(/Unlock/)
    expect(service.finalize(test.id).layoutVersion).toBe(1)

    const unlocked = service.unlock(test.id)
    expect(unlocked.status).toBe('draft')
    expect(unlocked.layout?.questionCount).toBe(3)
    service.update({ id: test.id, title: 'Quiz', instructions: '', questions: [q('One'), q('Two')] })
    const again = service.finalize(test.id)
    expect(again.layoutVersion).toBe(2)
    expect(again.layout?.questionCount).toBe(2)
  })

  it('updates the answer key at any status and validates it', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    service.update({ id: test.id, title: 'Quiz', instructions: '', questions: [q('One', 0), q('Two', 0)] })
    service.finalize(test.id)
    const keyed = service.updateKey({ id: test.id, correctChoices: [3, 2] })
    expect(keyed.questions.map((x) => x.correctChoice)).toEqual([3, 2])
    expect(keyed.status).toBe('finalized')
    expect(() => service.updateKey({ id: test.id, correctChoices: [1] })).toThrow(/one answer per question/)
    expect(() => service.updateKey({ id: test.id, correctChoices: [1, 4] })).toThrow(/Question 2 has no choice 5/)
  })

  it('copies a test into another section as a new draft with its own code', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    service.update({ id: test.id, title: 'Quiz', instructions: 'Pencil', questions: [q('One', 2)] })
    service.finalize(test.id)
    const copy = service.copy({ id: test.id, sectionId: otherSectionId })
    expect(copy.id).not.toBe(test.id)
    expect(copy.code).not.toBe(test.code)
    expect(copy.sectionId).toBe(otherSectionId)
    expect(copy.status).toBe('draft')
    expect(copy.title).toBe('Quiz')
    expect(copy.instructions).toBe('Pencil')
    expect(copy.questions.map((x) => [x.stem, x.correctChoice])).toEqual([['One', 2]])
    expect(service.copy({ id: test.id, sectionId, title: 'Quiz (retake)' }).title).toBe('Quiz (retake)')
  })

  it('lists summaries with counts, newest first, optionally per section', () => {
    students.create({ sectionId, lastName: 'A', firstName: 'B' })
    const a = service.create({ sectionId, title: 'A' })
    service.update({ id: a.id, title: 'A', instructions: '', questions: [q('1'), q('2')] })
    service.create({ sectionId: otherSectionId, title: 'B' })
    const all = service.list()
    expect(all.map((t) => t.title)).toEqual(['B', 'A'])
    const mine = service.list(sectionId)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ title: 'A', questionCount: 2, activeStudentCount: 1, resultCount: 0, status: 'draft' })
    expect(() => service.list(999)).toThrow(/Section 999/)
  })

  it('removes a test and its questions', () => {
    const test = service.create({ sectionId, title: 'Quiz' })
    service.remove(test.id)
    expect(() => service.get(test.id)).toThrow(/not found/)
    const rows = db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number }
    expect(rows.n).toBe(0)
  })

  it('retries when a generated code collides', () => {
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB']
    const repo = new TestRepository(db, () => codes.shift() ?? 'CCCCCC')
    const svc = new TestService(repo, new SectionRepository(db))
    expect(svc.create({ sectionId, title: 'x' }).code).toBe('AAAAAA')
    expect(svc.create({ sectionId, title: 'y' }).code).toBe('BBBBBB')
  })
})
