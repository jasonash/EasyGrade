import { describe, expect, it, beforeEach } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { PrintRunRepository } from '../../src/main/db/repositories/print-run.repo'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { StudentRepository } from '../../src/main/db/repositories/student.repo'
import { TestRepository } from '../../src/main/db/repositories/test.repo'
import { SectionService } from '../../src/main/services/section.service'
import { StudentService } from '../../src/main/services/student.service'
import { TestService } from '../../src/main/services/test.service'
import { PdfService, DATE_BLANK } from '../../src/main/services/pdf.service'
import { PrintService, pdfFileName } from '../../src/main/services/print.service'
import { AppError } from '../../src/main/services/errors'
import { formatQrPayload } from '../../src/shared/codes'
import type { Test } from '../../src/shared/types'

const q = (stem: string, choices = ['Positive', 'Negative', 'Neutral', 'Varies']) => ({ stem, choices, correctChoice: 1 })

/** Count page objects in a PDF. pdfkit writes "/Type /Page" once per page and "/Type /Pages" for the tree. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length
}

/**
 * Text runs drawn in an uncompressed PDF, one per line. pdfkit writes each
 * string as hex-encoded WinAnsi bytes, either `<hex> Tj` or, when kerning
 * applies, `[<hex> -50 <hex>] TJ`; the pieces of one TJ array are one run.
 */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const decode = (hex: string): string => Buffer.from(hex, 'hex').toString('latin1')
  const runs: string[] = []
  for (const m of raw.matchAll(/\[((?:\s*<[0-9a-fA-F]*>\s*-?[\d.]*)+)\s*\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
    if (m[1] !== undefined) {
      runs.push([...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => decode(h[1] ?? '')).join(''))
    } else {
      runs.push(decode(m[2] ?? ''))
    }
  }
  return runs.join('\n')
}

describe('PrintService', () => {
  let db: Db
  let tests: TestService
  let students: StudentService
  let print: PrintService
  let runs: PrintRunRepository
  let sectionId: number
  let otherSectionId: number
  let finalized: Test
  let alice: number
  let bob: number
  let carol: number

  beforeEach(() => {
    db = openDatabase({ path: ':memory:' })
    const sectionRepo = new SectionRepository(db)
    const studentRepo = new StudentRepository(db)
    const testRepo = new TestRepository(db)
    runs = new PrintRunRepository(db)
    const sections = new SectionService(sectionRepo)
    students = new StudentService(studentRepo, sectionRepo)
    tests = new TestService(testRepo, sectionRepo)
    print = new PrintService(testRepo, studentRepo, runs, new PdfService({ compress: false }))

    sectionId = sections.create({ name: 'First Block', schoolYear: '2026-27' }).id
    otherSectionId = sections.create({ name: 'Third Block', schoolYear: '2026-27' }).id
    carol = students.create({ sectionId, lastName: 'Zimmer', firstName: 'Carol', studentNumber: '1003' }).id
    alice = students.create({ sectionId, lastName: 'Adams', firstName: 'Alice', studentNumber: '1001' }).id
    bob = students.create({ sectionId, lastName: 'Baker', firstName: 'Bob' }).id
    students.deactivate(carol)

    const draft = tests.create({ sectionId, title: 'Unit 3 Quiz' })
    tests.update({
      id: draft.id,
      title: 'Unit 3 Quiz',
      instructions: 'Fill in one bubble completely for each question.',
      questions: [
        q('What is the charge of an electron?'),
        q('Which planet is closest to the sun?', ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter']),
        q('True or false: water boils at 100 C at sea level.', ['True', 'False']),
        q(
          'A long question stem that wraps onto more than one line so the slot layout is exercised by the PDF drawing code as well as the preview.',
          ['A choice that is long enough to force a single column layout in the grid', 'Short', 'Medium length choice', 'Another']
        )
      ]
    })
    finalized = tests.finalize(draft.id)
  })

  it('refuses drafts', () => {
    const draft = tests.create({ sectionId, title: 'Draft' })
    expect(() => print.prepare({ testId: draft.id, studentIds: null, blankCount: 1, dateLabel: null })).toThrow(AppError)
  })

  it('resolves null studentIds to the active roster in roster order', () => {
    const prepared = print.prepare({ testId: finalized.id, studentIds: null, blankCount: 0, dateLabel: 'Aug 25, 2026' })
    expect(prepared.students.map((s) => s.id)).toEqual([alice, bob])
    expect(prepared.dateLabel).toBe('Aug 25, 2026')
  })

  it('accepts explicit ids including inactive students but not other sections', () => {
    const prepared = print.prepare({ testId: finalized.id, studentIds: [carol, alice], blankCount: 0, dateLabel: null })
    expect(prepared.students.map((s) => s.id)).toEqual([alice, carol])
    const stranger = students.create({ sectionId: otherSectionId, lastName: 'Else', firstName: 'Someone' }).id
    expect(() => print.prepare({ testId: finalized.id, studentIds: [alice, stranger], blankCount: 0, dateLabel: null })).toThrow(
      /not in this section/
    )
  })

  it('rejects an empty run and bad counts', () => {
    expect(() => print.prepare({ testId: finalized.id, studentIds: [], blankCount: 0, dateLabel: null })).toThrow(/Nothing to print/)
    expect(() => print.prepare({ testId: finalized.id, studentIds: null, blankCount: 51, dateLabel: null })).toThrow()
    expect(() => print.prepare({ testId: finalized.id, studentIds: null, blankCount: -1, dateLabel: null })).toThrow()
  })

  it('generates one page per sheet with the right QR payloads and header text', async () => {
    const generated = await print.generate({ testId: finalized.id, studentIds: null, blankCount: 2, dateLabel: 'Aug 25, 2026' })
    expect(generated.pageCount).toBe(4)
    expect(pageCount(generated.buffer)).toBe(4)
    expect(generated.fileName).toBe(`Unit-3-Quiz-${finalized.code}.pdf`)

    const text = pdfText(generated.buffer)
    const aliceCode = students.get(alice).code
    const bobCode = students.get(bob).code
    expect(text).toContain(formatQrPayload({ testCode: finalized.code, studentCode: aliceCode, layoutVersion: 1 }))
    expect(text).toContain(formatQrPayload({ testCode: finalized.code, studentCode: bobCode, layoutVersion: 1 }))
    expect(text.split(formatQrPayload({ testCode: finalized.code, studentCode: null, layoutVersion: 1 })).length - 1).toBe(2)
    expect(text).toContain('Adams, Alice')
    expect(text).toContain('Baker, Bob')
    expect(text).toContain('1001')
    expect(text).toContain('Date: Aug 25, 2026')
    expect(text).toContain('First Block')
    expect(text).toContain('Unit 3 Quiz')
    expect(text).toContain('Fill in one bubble completely for each question.')
    expect(text).toContain('Mercury')
    // Only the two blank sheets carry the Name / Section boxes.
    expect(text.split('\nSection\n').length - 1).toBe(2)
  })

  it('prints a blank date line when no label is given and blank-only runs work', async () => {
    const generated = await print.generate({ testId: finalized.id, studentIds: [], blankCount: 3, dateLabel: '' })
    expect(generated.pageCount).toBe(3)
    expect(generated.students).toEqual([])
    expect(generated.dateLabel).toBeNull()
    expect(pdfText(generated.buffer)).toContain(`Date: ${DATE_BLANK}`)
  })

  it('records runs and stamps last_printed_at', async () => {
    expect(tests.get(finalized.id).lastPrintedAt).toBeNull()
    const generated = await print.generate({ testId: finalized.id, studentIds: [bob], blankCount: 1, dateLabel: 'Friday' })
    const run = print.record(generated)
    expect(run).toMatchObject({ testId: finalized.id, layoutVersion: 1, dateLabel: 'Friday', studentIds: [bob], blankCount: 1 })
    expect(tests.get(finalized.id).lastPrintedAt).toBe(run.printedAt)
    expect(print.listRuns(finalized.id)).toEqual([run])
    expect(() => print.listRuns(9999)).toThrow(AppError)

    const outcome = print.outcome(generated, '/tmp/x.pdf', run)
    expect(outcome).toEqual({ path: '/tmp/x.pdf', pageCount: 2, studentCount: 1, blankCount: 1, printRun: run })
  })

  it('renders every question count from 1 to 10 on exactly one page each', async () => {
    for (let n = 1; n <= 10; n++) {
      const draft = tests.create({ sectionId, title: `${n} questions` })
      tests.update({
        id: draft.id,
        title: `${n} questions`,
        instructions: '',
        questions: Array.from({ length: n }, (_, i) => q(`Question number ${i + 1} with a reasonably long stem to wrap once.`))
      })
      const done = tests.finalize(draft.id)
      const generated = await print.generate({ testId: done.id, studentIds: null, blankCount: 0, dateLabel: null })
      expect(generated.pageCount).toBe(2)
      expect(pageCount(generated.buffer)).toBe(2)
    }
  })
})

describe('PdfService guards', () => {
  it('refuses to draw a test whose text no longer fits', async () => {
    const db = openDatabase({ path: ':memory:' })
    const sectionRepo = new SectionRepository(db)
    const testRepo = new TestRepository(db)
    const tests = new TestService(testRepo, sectionRepo)
    const sectionId = new SectionService(sectionRepo).create({ name: 'S', schoolYear: '' }).id
    const draft = tests.create({ sectionId, title: 'T' })
    tests.update({ id: draft.id, title: 'T', instructions: '', questions: Array.from({ length: 10 }, (_, i) => q(`Q${i + 1}`)) })
    const done = tests.finalize(draft.id)
    // Sabotage: a stem far too long for a 10-question slot, bypassing the service guard.
    db.prepare('UPDATE questions SET stem = ? WHERE test_id = ? AND position = 2').run('word '.repeat(48), done.id)
    const broken = testRepo.findById(done.id)
    if (!broken || !broken.layout) throw new Error('setup')
    await expect(
      new PdfService().render({ test: broken, layout: broken.layout, students: [], blankCount: 1, dateLabel: null })
    ).rejects.toThrow(/Question 3/)
  })

  it('builds safe file names', () => {
    expect(pdfFileName({ title: 'Unit 3: Cells & Energy / Part 2', code: 'ABC123' })).toBe('Unit-3-Cells-Energy-Part-2-ABC123.pdf')
    expect(pdfFileName({ title: '???', code: 'ABC123' })).toBe('test-ABC123.pdf')
  })
})
