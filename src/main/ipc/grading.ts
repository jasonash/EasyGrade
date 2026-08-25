import { IPC } from '@shared/ipc'
import type { GradeResult, OverrideAnswerInput, RegradeOutcome, SetReviewedInput, StudentResults, TestResults } from '@shared/types'
import type { Services } from '../services'
import { handle } from './handle'

/** Results views and teacher decisions on graded results. */
export function registerGradingHandlers(services: () => Services): void {
  const grading = (): Services['grading'] => services().grading
  handle<[number], TestResults>(IPC.grading.resultsForTest, (testId) => grading().resultsForTest(testId))
  handle<[number], StudentResults>(IPC.grading.resultsForStudent, (studentId) => grading().resultsForStudent(studentId))
  handle<[number], GradeResult>(IPC.grading.getResult, (id) => grading().getResult(id))
  handle<[OverrideAnswerInput], GradeResult>(IPC.grading.overrideAnswer, (input) => grading().overrideAnswer(input))
  handle<[SetReviewedInput], GradeResult>(IPC.grading.setReviewed, (input) => grading().setReviewed(input))
  handle<[number], RegradeOutcome>(IPC.grading.regradeTest, (testId) => grading().regradeTest(testId))
}
