import type { PrintOutcome, PrintRequest, PrintRun, Student, Test } from '@shared/types'
import { PrintRequestSchema } from '@shared/schemas'
import type { TestRepository } from '../db/repositories/test.repo'
import type { StudentRepository } from '../db/repositories/student.repo'
import type { PrintRunRepository } from '../db/repositories/print-run.repo'
import type { PdfService } from './pdf.service'
import { AppError } from './errors'

export interface PreparedPrint {
  test: Test
  students: Student[]
  blankCount: number
  dateLabel: string | null
}

export interface GeneratedPdf extends PreparedPrint {
  buffer: Buffer
  pageCount: number
  /** File name suggestion, safe on every platform. */
  fileName: string
}

export class PrintService {
  constructor(
    private readonly tests: TestRepository,
    private readonly students: StudentRepository,
    private readonly runs: PrintRunRepository,
    private readonly pdf: PdfService
  ) {}

  /** Validate the request against the database and resolve the student list (roster order). */
  prepare(input: PrintRequest): PreparedPrint {
    const parsed = PrintRequestSchema.parse(input)
    const test = this.tests.findById(parsed.testId)
    if (!test) throw new AppError('NOT_FOUND', `Test ${parsed.testId} not found`)
    if (test.status !== 'finalized' || !test.layout) {
      throw new AppError('CONFLICT', 'Finalize the test before printing')
    }

    const roster = this.students.listBySection(test.sectionId, true)
    let students: Student[]
    if (parsed.studentIds === null) {
      students = roster.filter((s) => s.active)
    } else {
      const wanted = new Set(parsed.studentIds)
      students = roster.filter((s) => wanted.has(s.id))
      if (students.length !== wanted.size) {
        throw new AppError('VALIDATION', 'Some selected students are not in this section')
      }
    }
    if (students.length === 0 && parsed.blankCount === 0) {
      throw new AppError('VALIDATION', 'Nothing to print: choose students or blank copies')
    }
    const dateLabel = parsed.dateLabel === null || parsed.dateLabel === '' ? null : parsed.dateLabel
    return { test, students, blankCount: parsed.blankCount, dateLabel }
  }

  async generate(input: PrintRequest): Promise<GeneratedPdf> {
    const prepared = this.prepare(input)
    const { test } = prepared
    if (!test.layout) throw new AppError('CONFLICT', 'Finalize the test before printing')
    const { buffer, pageCount } = await this.pdf.render({
      test,
      layout: test.layout,
      students: prepared.students,
      blankCount: prepared.blankCount,
      dateLabel: prepared.dateLabel
    })
    return { ...prepared, buffer, pageCount, fileName: pdfFileName(test) }
  }

  /** Persist the run and stamp the test. Call after the PDF has actually been saved or handed to a printer. */
  record(generated: GeneratedPdf): PrintRun {
    return this.runs.insert({
      testId: generated.test.id,
      layoutVersion: generated.test.layoutVersion,
      dateLabel: generated.dateLabel,
      studentIds: generated.students.map((s) => s.id),
      blankCount: generated.blankCount
    })
  }

  listRuns(testId: number): PrintRun[] {
    if (!this.tests.findById(testId)) throw new AppError('NOT_FOUND', `Test ${testId} not found`)
    return this.runs.listByTest(testId)
  }

  outcome(generated: GeneratedPdf, path: string, printRun: PrintRun | null): PrintOutcome {
    return {
      path,
      pageCount: generated.pageCount,
      studentCount: generated.students.length,
      blankCount: generated.blankCount,
      printRun
    }
  }
}

export function pdfFileName(test: Pick<Test, 'title' | 'code'>): string {
  const slug = test.title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${slug === '' ? 'test' : slug}-${test.code}.pdf`
}
