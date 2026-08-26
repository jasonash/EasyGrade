import type { ZodError } from 'zod'
import { FinalTestSchema } from './schemas/test'
import { CHOICE_LETTERS } from './layout/constants'

export interface FinalizeCandidate {
  title: string
  instructions: string
  questions: { stem: string; choices: string[]; correctChoice: number }[]
}

/** "Question 2, choice C: Choice text is required", the way the editor labels things. */
export function describeFinalizeIssue(issue: ZodError['issues'][number]): string {
  const [head, index, field, choiceIndex] = issue.path
  let where = ''
  if (head === 'questions' && typeof index === 'number') {
    const n = index + 1
    if (field === 'choices' && typeof choiceIndex === 'number') {
      where = `Question ${n}, choice ${CHOICE_LETTERS[choiceIndex] ?? choiceIndex + 1}: `
    } else {
      where = `Question ${n}: `
    }
  } else if (head === 'title') {
    where = 'Title: '
  } else if (head === 'instructions') {
    where = 'Instructions: '
  }
  return `${where}${issue.message}`
}

/**
 * The first thing stopping a draft from being finalized, or null when the
 * strict schema accepts it. The renderer shows this before the teacher can
 * click Finalize; the service repeats the same check as the authority.
 */
export function firstFinalizeProblem(candidate: FinalizeCandidate): string | null {
  const result = FinalTestSchema.safeParse(candidate)
  if (result.success) return null
  const issue = result.error.issues[0]
  return issue ? describeFinalizeIssue(issue) : 'The test cannot be finalized yet'
}
