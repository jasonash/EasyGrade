import { z } from 'zod'
import { IdSchema } from './common'
import { MAX_BUBBLES, MAX_SHEET_QUESTIONS } from '../layout/constants'
import type { GradeResult, ScanPageDetail } from './scan'
import type { Student } from './student'
import type { TestSummary } from './test'

/**
 * Teacher actions on scanned pages and results (Phase 6): assign a page to
 * a student, resolve a conflict, override an answer, mark reviewed, and the
 * read models behind the Results and Student views.
 */

const AnswerSchema = z.number().int().min(0).max(MAX_BUBBLES - 1).nullable()

export const AssignPageInputSchema = z.object({
  pageId: IdSchema,
  testId: IdSchema,
  studentId: IdSchema,
  /** When the pair already has a result, replace it instead of reporting a conflict. */
  replace: z.boolean().default(false),
  /** Manual answers for a page whose bubbles could not be read (one entry per question). */
  answers: z.array(AnswerSchema).min(1).max(MAX_SHEET_QUESTIONS).optional()
})
export type AssignPageInput = z.input<typeof AssignPageInputSchema>

export type AssignOutcome =
  | { status: 'assigned'; page: ScanPageDetail }
  | { status: 'conflict'; existing: GradeResult; existingPage: ScanPageDetail | null }

export const ConflictActionSchema = z.enum(['keep', 'replace'])
export type ConflictAction = z.infer<typeof ConflictActionSchema>

export const ResolveConflictInputSchema = z.object({
  pageId: IdSchema,
  action: ConflictActionSchema
})
export type ResolveConflictInput = z.infer<typeof ResolveConflictInputSchema>

export const OverrideAnswerInputSchema = z.object({
  resultId: IdSchema,
  q: z.number().int().min(0).max(MAX_SHEET_QUESTIONS - 1),
  /** `{ choice }` sets the override (null = blank); `null` removes it and restores the detection. */
  override: z.object({ choice: AnswerSchema, note: z.string().trim().max(200).optional() }).nullable()
})
export type OverrideAnswerInput = z.infer<typeof OverrideAnswerInputSchema>

export const SetReviewedInputSchema = z.object({
  resultId: IdSchema,
  reviewed: z.boolean()
})
export type SetReviewedInput = z.infer<typeof SetReviewedInputSchema>

/** One row of the Results table. */
export interface ResultRow {
  result: GradeResult
  student: Student
  page: { id: number; batchId: number; pageIndex: number; thumbPath: string | null } | null
}

export interface ResultsQuestion {
  position: number
  correctChoice: number
  choiceCount: number
}

export interface TestResults {
  test: TestSummary
  questions: ResultsQuestion[]
  rows: ResultRow[]
  /** Active students in the section with no result yet. */
  missing: Student[]
  /** Mean percent over rows, null when there are no rows. */
  averagePercent: number | null
  /** Fraction of results that answered each question correctly (0-1), null when there are no rows. */
  perQuestionCorrect: (number | null)[]
}

export interface StudentResultRow {
  result: GradeResult
  test: TestSummary
  page: { id: number; batchId: number; pageIndex: number; thumbPath: string | null } | null
}

export interface StudentResults {
  student: Student
  rows: StudentResultRow[]
}

export interface RegradeOutcome {
  /** Results rescored. */
  count: number
}
