import type { DetectedRow, GradeResult, QuestionFlag } from '@shared/schemas'
import type { Test } from '@shared/types'
import type { ResultRepository } from '../db/repositories/result.repo'
import type { TestRepository } from '../db/repositories/test.repo'
import { AppError } from './errors'
import { LOW_CONFIDENCE } from '../scan/thresholds'

/**
 * Scoring. One point per question (the points column is honoured but every
 * question is 1 today). Blank, multiple, and ambiguous rows score 0 and are
 * flagged for review. Results are unique per (test, student); a second
 * sheet for the same pair is a conflict the teacher resolves in Phase 6.
 */

export interface Score {
  rawAnswers: (number | null)[]
  correctCount: number
  possibleCount: number
  flags: QuestionFlag[]
}

export function scoreAnswers(test: Test, answers: DetectedRow[]): Score {
  const rawAnswers: (number | null)[] = []
  const flags: QuestionFlag[] = []
  let correctCount = 0
  let possibleCount = 0
  test.questions.forEach((question, q) => {
    const row = answers[q]
    possibleCount += question.points
    const choice = row?.state === 'filled' ? row.choice : null
    rawAnswers.push(choice)
    if (!row) {
      flags.push({ q, kind: 'blank' })
      return
    }
    if (row.state !== 'filled') {
      flags.push({ q, kind: row.state })
    } else if (row.confidence < LOW_CONFIDENCE) {
      flags.push({ q, kind: 'low_confidence' })
    }
    if (choice !== null && choice === question.correctChoice) correctCount += question.points
  })
  return { rawAnswers, correctCount, possibleCount, flags }
}

export interface UpsertOutcome {
  result: GradeResult | null
  /** True when a result already existed for this test and student; nothing was written. */
  conflict: boolean
}

export class GradingService {
  constructor(
    private readonly results: ResultRepository,
    private readonly tests: TestRepository
  ) {}

  /** Store a freshly scanned page's answers, unless the pair already has a result. */
  recordFromScan(input: { testId: number; studentId: number; scanPageId: number; layoutVersion: number; answers: DetectedRow[] }): UpsertOutcome {
    const existing = this.results.findByPair(input.testId, input.studentId)
    if (existing) return { result: existing, conflict: true }
    const test = this.tests.findById(input.testId)
    if (!test) throw new AppError('NOT_FOUND', 'Test not found')
    const score = scoreAnswers(test, input.answers)
    const result = this.results.insert({
      testId: input.testId,
      studentId: input.studentId,
      scanPageId: input.scanPageId,
      layoutVersion: input.layoutVersion,
      rawAnswers: score.rawAnswers,
      finalAnswers: score.rawAnswers,
      correctCount: score.correctCount,
      possibleCount: score.possibleCount,
      flags: score.flags
    })
    return { result, conflict: false }
  }

  listByTest(testId: number): GradeResult[] {
    return this.results.listByTest(testId)
  }
}
