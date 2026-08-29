import type { CsvCell } from '@shared/csv'
import { fileSlug, toCsv } from '@shared/csv'
import { choiceLabel } from '@shared/layout'
import type { LabelStyle, QuestionFlag } from '@shared/schemas'
import type { SectionRepository } from '../db/repositories/section.repo'
import type { StudentRepository } from '../db/repositories/student.repo'
import type { TestRepository } from '../db/repositories/test.repo'
import { AppError } from './errors'
import type { GradingService } from './grading.service'

/**
 * CSV exports (PRD FR-5.3 and FR-5.4). Builds the text; the IPC layer owns
 * the save dialog and the file. Percentages are whole numbers so they paste
 * straight into a gradebook.
 */

export interface CsvExport {
  fileName: string
  csv: string
  /** Data rows, header excluded. */
  rows: number
}

const FLAG_WORDS: Record<QuestionFlag['kind'], string> = {
  blank: 'blank',
  multiple: 'multiple',
  ambiguous: 'ambiguous',
  low_confidence: 'faint'
}

function letter(choice: number | null | undefined, labelStyle: LabelStyle = 'letters'): string {
  return choice === null || choice === undefined ? '' : choiceLabel(choice, labelStyle)
}

function percent(correct: number, possible: number): number | null {
  return possible > 0 ? Math.round((100 * correct) / possible) : null
}

export class ExportService {
  constructor(
    private readonly grading: GradingService,
    private readonly tests: TestRepository,
    private readonly students: StudentRepository,
    private readonly sections: SectionRepository
  ) {}

  /** One row per student on the roster (graded or missing), per-question answers, flags, reviewed. */
  testCsv(testId: number): CsvExport {
    const view = this.grading.resultsForTest(testId)
    const questionCount = view.questions.length
    const header: CsvCell[] = ['Last name', 'First name', 'Student number', 'Status', 'Correct', 'Possible', 'Percent']
    for (let q = 0; q < questionCount; q++) header.push(`Q${q + 1}`)
    header.push('Flags', 'Reviewed', 'Graded at')

    const rows: CsvCell[][] = [header]
    for (const row of view.rows) {
      const r = row.result
      const line: CsvCell[] = [
        row.student.lastName,
        row.student.firstName,
        row.student.studentNumber ?? '',
        'graded',
        r.correctCount,
        r.possibleCount,
        percent(r.correctCount, r.possibleCount)
      ]
      for (let q = 0; q < questionCount; q++) line.push(letter(r.finalAnswers[q], view.questions[q]?.labelStyle))
      line.push(
        r.flags.map((f) => `Q${f.q + 1} ${FLAG_WORDS[f.kind]}`).join('; '),
        r.reviewed ? 'yes' : 'no',
        r.gradedAt
      )
      rows.push(line)
    }
    for (const student of view.missing) {
      const line: CsvCell[] = [student.lastName, student.firstName, student.studentNumber ?? '', 'missing', null, null, null]
      for (let q = 0; q < questionCount; q++) line.push('')
      line.push('', '', '')
      rows.push(line)
    }
    // Key row at the bottom so the sheet is self-describing.
    const keyLine: CsvCell[] = ['Answer key', '', '', '', '', '', '']
    for (const q of view.questions) keyLine.push(letter(q.correctChoice, q.labelStyle))
    keyLine.push('', '', '')
    rows.push(keyLine)

    return { fileName: `${fileSlug(view.test.title, 'results')}-results.csv`, csv: toCsv(rows), rows: rows.length - 1 }
  }

  /** One row per active student, one percent column per finalized test in the section, plus an average. */
  sectionCsv(sectionId: number): CsvExport {
    const section = this.sections.findById(sectionId)
    if (!section) throw new AppError('NOT_FOUND', 'Section not found')
    const tests = this.tests
      .list(sectionId)
      .filter((t) => t.status === 'finalized')
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id - b.id)
    const roster = this.students.listBySection(sectionId, false)

    const scores = new Map<number, Map<number, number | null>>()
    for (const test of tests) {
      const byStudent = new Map<number, number | null>()
      for (const row of this.grading.listByTest(test.id)) byStudent.set(row.studentId, percent(row.correctCount, row.possibleCount))
      scores.set(test.id, byStudent)
    }

    const header: CsvCell[] = ['Last name', 'First name', 'Student number', ...tests.map((t) => t.title), 'Average']
    const rows: CsvCell[][] = [header]
    for (const student of roster) {
      const values = tests.map((t) => scores.get(t.id)?.get(student.id) ?? null)
      const graded = values.filter((v): v is number => v !== null)
      const average = graded.length > 0 ? Math.round(graded.reduce((a, b) => a + b, 0) / graded.length) : null
      rows.push([student.lastName, student.firstName, student.studentNumber ?? '', ...values, average])
    }
    return { fileName: `${fileSlug(section.name, 'section')}-grades.csv`, csv: toCsv(rows), rows: rows.length - 1 }
  }
}
