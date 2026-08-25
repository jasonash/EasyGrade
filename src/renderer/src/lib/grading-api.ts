import type { GradeResult, OverrideAnswerInput, RegradeOutcome, SetReviewedInput, StudentResults, TestResults } from '@shared/types'
import { api, unwrap } from '@/api'

/** Thin typed wrappers over the grading IPC. Results are read fresh on each view; nothing is cached. */
export const gradingApi = {
  resultsForTest: (testId: number): Promise<TestResults> => unwrap(api.grading.resultsForTest(testId)),
  resultsForStudent: (studentId: number): Promise<StudentResults> => unwrap(api.grading.resultsForStudent(studentId)),
  getResult: (resultId: number): Promise<GradeResult> => unwrap(api.grading.getResult(resultId)),
  overrideAnswer: (input: OverrideAnswerInput): Promise<GradeResult> => unwrap(api.grading.overrideAnswer(input)),
  setReviewed: (input: SetReviewedInput): Promise<GradeResult> => unwrap(api.grading.setReviewed(input)),
  regradeTest: (testId: number): Promise<RegradeOutcome> => unwrap(api.grading.regradeTest(testId))
}
