import type {
  AnswerOverride,
  DetectedRow,
  GradeResult,
  OverrideAnswerInput,
  QuestionFlag,
  RegradeOutcome,
  ResultRow,
  SetReviewedInput,
  StudentResults,
  TestResults
} from '@shared/schemas'
import { OverrideAnswerInputSchema, SetReviewedInputSchema } from '@shared/schemas'
import type { Student, Test, TestSummary } from '@shared/types'
import type { ResultRepository, ScorePatch } from '../db/repositories/result.repo'
import type { ScanRepository } from '../db/repositories/scan.repo'
import type { StudentRepository } from '../db/repositories/student.repo'
import type { TestRepository } from '../db/repositories/test.repo'
import { AppError } from './errors'
import { LOW_CONFIDENCE } from '../scan/thresholds'

/**
 * Scoring. One point per question (the points column is honoured but every
 * question is 1 today). Blank, multiple, and ambiguous rows score 0 and are
 * flagged for review. Results are unique per (test, student); a second
 * sheet for the same pair is a conflict the teacher resolves explicitly.
 *
 * A result keeps the raw detection forever. Everything the teacher does
 * (overrides) and everything that changes later (the answer key) is applied
 * by `rescore`, so a key change never needs the scan again.
 */

export interface Score {
  rawAnswers: (number | null)[]
  correctCount: number
  possibleCount: number
  flags: QuestionFlag[]
}

/** Raw answers, final answers, score, and flags from a set of raw answers plus overrides. */
export function rescore(
  test: Test,
  rawAnswers: (number | null)[],
  detected: DetectedRow[] | null,
  overrides: AnswerOverride[]
): ScorePatch {
  const byQuestion = new Map(overrides.map((o) => [o.q, o]))
  const finalAnswers: (number | null)[] = []
  const flags: QuestionFlag[] = []
  let correctCount = 0
  let possibleCount = 0
  test.questions.forEach((question, q) => {
    possibleCount += question.points
    const override = byQuestion.get(q)
    const raw = rawAnswers[q] ?? null
    const final = override ? override.overrideChoice : raw
    finalAnswers.push(final)
    if (!override) {
      const row = detected?.[q]
      if (row) {
        if (row.state !== 'filled') flags.push({ q, kind: row.state })
        else if (row.confidence < LOW_CONFIDENCE) flags.push({ q, kind: 'low_confidence' })
      } else if (raw === null) {
        flags.push({ q, kind: 'blank' })
      }
    }
    if (final !== null && final === question.correctChoice) correctCount += question.points
  })
  return { finalAnswers, correctCount, possibleCount, flags }
}

export function rawFromDetected(answers: DetectedRow[], questionCount: number): (number | null)[] {
  const raw: (number | null)[] = []
  for (let q = 0; q < questionCount; q++) {
    const row = answers[q]
    raw.push(row?.state === 'filled' ? row.choice : null)
  }
  return raw
}

export function scoreAnswers(test: Test, answers: DetectedRow[]): Score {
  const rawAnswers = rawFromDetected(answers, test.questions.length)
  const patch = rescore(test, rawAnswers, answers, [])
  return { rawAnswers, correctCount: patch.correctCount, possibleCount: patch.possibleCount, flags: patch.flags }
}

export interface UpsertOutcome {
  result: GradeResult | null
  /** True when a result already existed for this test and student; nothing was written. */
  conflict: boolean
}

export interface RecordInput {
  testId: number
  studentId: number
  scanPageId: number
  layoutVersion: number
  /**
   * Page-level reasons a person should still look (weak alignment, a stale layout read). A scanned
   * result starts reviewed only when the read carried no question flags and none of these apply.
   */
  needsLook?: boolean
}

export class GradingService {
  constructor(
    private readonly results: ResultRepository,
    private readonly tests: TestRepository,
    private readonly scans: ScanRepository,
    private readonly students: StudentRepository
  ) {}

  /** Store a freshly scanned page's answers, unless the pair already has a result. */
  recordFromScan(input: RecordInput & { answers: DetectedRow[] }): UpsertOutcome {
    const existing = this.results.findByPair(input.testId, input.studentId)
    if (existing) return { result: existing, conflict: true }
    const test = this.requireTest(input.testId)
    const score = scoreAnswers(test, input.answers)
    const reviewed = score.flags.length === 0 && !input.needsLook
    return { result: this.insert(input, score, reviewed), conflict: false }
  }

  /** Store answers the teacher typed in for a page whose bubbles could not be read. Typed by a person, so reviewed. */
  recordManual(input: RecordInput & { rawAnswers: (number | null)[] }): UpsertOutcome {
    const existing = this.results.findByPair(input.testId, input.studentId)
    if (existing) return { result: existing, conflict: true }
    const test = this.requireTest(input.testId)
    const patch = rescore(test, input.rawAnswers, null, [])
    const score: Score = { rawAnswers: input.rawAnswers, correctCount: patch.correctCount, possibleCount: patch.possibleCount, flags: patch.flags }
    return { result: this.insert(input, score, true), conflict: false }
  }

  private insert(input: RecordInput, score: Score, reviewed: boolean): GradeResult {
    return this.results.insert({
      testId: input.testId,
      studentId: input.studentId,
      scanPageId: input.scanPageId,
      layoutVersion: input.layoutVersion,
      rawAnswers: score.rawAnswers,
      finalAnswers: score.rawAnswers,
      correctCount: score.correctCount,
      possibleCount: score.possibleCount,
      flags: score.flags,
      reviewed
    })
  }

  getResult(id: number): GradeResult {
    const result = this.results.findById(id)
    if (!result) throw new AppError('NOT_FOUND', 'Result not found')
    return result
  }

  listByTest(testId: number): GradeResult[] {
    return this.results.listByTest(testId)
  }

  deleteResult(id: number): void {
    this.results.delete(id)
  }

  /** Set, change, or remove the teacher's answer for one question, then rescore. */
  overrideAnswer(input: OverrideAnswerInput): GradeResult {
    const parsed = OverrideAnswerInputSchema.parse(input)
    const result = this.getResult(parsed.resultId)
    const test = this.requireTest(result.testId)
    const question = test.questions[parsed.q]
    if (!question) throw new AppError('VALIDATION', `This test has no question ${parsed.q + 1}`)
    if (parsed.override === null) {
      this.results.deleteOverride(result.id, parsed.q)
    } else {
      const choice = parsed.override.choice
      if (choice !== null && choice >= question.choices.length) {
        throw new AppError('VALIDATION', `Question ${parsed.q + 1} has no choice ${choice + 1}`)
      }
      this.results.upsertOverride(result.id, {
        q: parsed.q,
        rawChoice: result.rawAnswers[parsed.q] ?? null,
        overrideChoice: choice,
        note: parsed.override.note?.trim() || null
      })
    }
    return this.rescoreResult(this.getResult(result.id), test)
  }

  setReviewed(input: SetReviewedInput): GradeResult {
    const parsed = SetReviewedInputSchema.parse(input)
    this.getResult(parsed.resultId)
    this.results.setReviewed(parsed.resultId, parsed.reviewed)
    return this.getResult(parsed.resultId)
  }

  /** Recompute final answers, score, and flags from the stored raw answers, the page's detection, and overrides. */
  rescoreResult(result: GradeResult, test: Test = this.requireTest(result.testId)): GradeResult {
    const detected = result.scanPageId !== null ? (this.scans.getPage(result.scanPageId)?.detected ?? null) : null
    this.results.updateScore(result.id, rescore(test, result.rawAnswers, detected, result.overrides))
    return this.getResult(result.id)
  }

  /** Rescore every result of a test (after a key change or re-finalize). */
  regradeTest(testId: number): RegradeOutcome {
    const test = this.requireTest(testId)
    const results = this.results.listByTest(testId)
    for (const result of results) this.rescoreResult(result, test)
    return { count: results.length }
  }

  resultsForTest(testId: number): TestResults {
    const test = this.requireTest(testId)
    const roster = this.students.listBySection(test.sectionId, false)
    const summary = this.summarize(test, roster.length)
    const questions = test.questions.map((q) => ({ position: q.position, correctChoice: q.correctChoice, choiceCount: q.choices.length }))

    const rows: ResultRow[] = []
    for (const result of this.results.listByTest(testId)) {
      const student = this.students.findById(result.studentId)
      if (!student) continue
      rows.push({ result, student, page: this.pageRef(result.scanPageId) })
    }
    rows.sort((a, b) => compareNames(a.student, b.student))

    const graded = new Set(rows.map((r) => r.result.studentId))
    const missing = roster.filter((s) => !graded.has(s.id))

    const percents = rows.map((r) => (r.result.possibleCount > 0 ? (100 * r.result.correctCount) / r.result.possibleCount : 0))
    const averagePercent = percents.length > 0 ? percents.reduce((a, b) => a + b, 0) / percents.length : null
    const perQuestionCorrect = questions.map((question, q) => {
      if (rows.length === 0) return null
      const correct = rows.filter((r) => r.result.finalAnswers[q] === question.correctChoice).length
      return correct / rows.length
    })

    return { test: summary, questions, rows, missing, averagePercent, perQuestionCorrect }
  }

  resultsForStudent(studentId: number): StudentResults {
    const student = this.students.findById(studentId)
    if (!student) throw new AppError('NOT_FOUND', 'Student not found')
    const rows: StudentResults['rows'] = []
    for (const result of this.results.listByStudent(studentId)) {
      const test = this.tests.findById(result.testId)
      if (!test) continue
      rows.push({ result, test: this.summarize(test), page: this.pageRef(result.scanPageId) })
    }
    return { student, rows }
  }

  private pageRef(pageId: number | null): ResultRow['page'] {
    if (pageId === null) return null
    const page = this.scans.getPage(pageId)
    return page ? { id: page.id, batchId: page.batchId, pageIndex: page.pageIndex, thumbPath: page.thumbPath } : null
  }

  private summarize(test: Test, activeStudentCount = this.students.listBySection(test.sectionId, false).length): TestSummary {
    return {
      id: test.id,
      sectionId: test.sectionId,
      sectionName: test.sectionName,
      schoolYear: test.schoolYear,
      code: test.code,
      kind: test.kind,
      title: test.title,
      status: test.status,
      questionCount: test.questions.length,
      layoutVersion: test.layoutVersion,
      lastPrintedAt: test.lastPrintedAt,
      resultCount: test.resultCount,
      activeStudentCount,
      updatedAt: test.updatedAt
    }
  }

  private requireTest(testId: number): Test {
    const test = this.tests.findById(testId)
    if (!test) throw new AppError('NOT_FOUND', 'Test not found')
    return test
  }
}

function compareNames(a: Student, b: Student): number {
  return (
    a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' }) ||
    a.id - b.id
  )
}
