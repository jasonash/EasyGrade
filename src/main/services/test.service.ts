import type { Test, TestCopyInput, TestCreateInput, TestKeyUpdate, TestSummary, TestUpdateInput } from '@shared/types'
import {
  FinalTestSchema,
  TestCopyInputSchema,
  TestCreateInputSchema,
  TestKeyUpdateSchema,
  TestUpdateInputSchema
} from '@shared/schemas'
import { buildSheetLayout, measureTest } from '@shared/layout'
import type { TestRepository } from '../db/repositories/test.repo'
import type { SectionRepository } from '../db/repositories/section.repo'
import { AppError } from './errors'
import { describeFinalizeIssue } from '@shared/test-validation'
import { DEFAULT_INSTRUCTIONS, DEFAULT_TEST_TITLE } from '@shared/schemas'

/** Kept for callers that import it from here; the value lives in the shared schema. */
export const DEFAULT_TITLE = DEFAULT_TEST_TITLE

function blankQuestion(): { stem: string; choices: string[]; correctChoice: number } {
  return { stem: '', choices: ['', '', '', ''], correctChoice: 0 }
}

export type KeyChangeListener = (testId: number) => void

export class TestService {
  private readonly keyListeners: KeyChangeListener[] = []

  constructor(
    private readonly repo: TestRepository,
    private readonly sections: SectionRepository
  ) {}

  /** Called after the answer key changes or the test is re-finalized, so results can be rescored. */
  onKeyChange(listener: KeyChangeListener): void {
    this.keyListeners.push(listener)
  }

  private notifyKeyChange(testId: number): void {
    for (const listener of this.keyListeners) listener(testId)
  }

  list(sectionId?: number): TestSummary[] {
    if (sectionId !== undefined) this.requireSection(sectionId)
    return this.repo.list(sectionId)
  }

  get(id: number): Test {
    const test = this.repo.findById(id)
    if (!test) throw new AppError('NOT_FOUND', `Test ${id} not found`)
    return test
  }

  /** New draft with the default instructions and one blank question so the editor has something to show. */
  create(input: TestCreateInput): Test {
    const parsed = TestCreateInputSchema.parse(input)
    this.requireSection(parsed.sectionId)
    return this.repo.insert({
      sectionId: parsed.sectionId,
      title: parsed.title === '' ? DEFAULT_TITLE : parsed.title,
      instructions: DEFAULT_INSTRUCTIONS,
      questions: [blankQuestion()]
    })
  }

  update(input: TestUpdateInput): Test {
    const parsed = TestUpdateInputSchema.parse(input)
    const test = this.get(parsed.id)
    if (test.status !== 'draft') {
      throw new AppError('CONFLICT', 'This test is finalized. Unlock it to edit the questions.')
    }
    this.repo.replaceQuestions(
      parsed.id,
      parsed.questions.map((q) => ({
        stem: q.stem.trim(),
        choices: q.choices.map((c) => c.trim()),
        correctChoice: q.correctChoice
      }))
    )
    const updated = this.repo.update(parsed.id, { title: parsed.title, instructions: parsed.instructions })
    if (!updated) throw new AppError('NOT_FOUND', `Test ${parsed.id} not found`)
    return updated
  }

  /** Change the answer key without touching the layout. Works on finalized tests. */
  updateKey(input: TestKeyUpdate): Test {
    const parsed = TestKeyUpdateSchema.parse(input)
    const test = this.get(parsed.id)
    if (parsed.correctChoices.length !== test.questions.length) {
      throw new AppError('VALIDATION', 'The key must have one answer per question')
    }
    parsed.correctChoices.forEach((choice, i) => {
      const question = test.questions[i]
      if (!question || choice >= question.choices.length) {
        throw new AppError('VALIDATION', `Question ${i + 1} has no choice ${choice + 1}`)
      }
    })
    this.repo.updateKey(parsed.id, parsed.correctChoices)
    this.notifyKeyChange(parsed.id)
    return this.get(parsed.id)
  }

  finalize(id: number): Test {
    const test = this.get(id)
    if (test.status === 'finalized') return test

    const strict = FinalTestSchema.safeParse({
      title: test.title,
      instructions: test.instructions,
      questions: test.questions.map((q) => ({ stem: q.stem, choices: q.choices, correctChoice: q.correctChoice }))
    })
    if (!strict.success) {
      const issue = strict.error.issues[0]
      throw new AppError('VALIDATION', issue ? describeFinalizeIssue(issue) : 'Invalid test')
    }

    const measure = measureTest(strict.data)
    if (!measure.fits) {
      const detail =
        measure.problems[0] ??
        measure.questions
          .filter((q) => !q.fits)
          .map((q) => `Question ${q.index + 1}: ${q.problems.join('; ')}`)
          .join('. ')
      throw new AppError('VALIDATION', `The test does not fit on one page. ${detail}`)
    }

    const layout = buildSheetLayout(strict.data.questions.map((q) => q.choices.length))
    const updated = this.repo.update(id, {
      status: 'finalized',
      layoutJson: JSON.stringify(layout),
      layoutVersion: test.layout === null ? test.layoutVersion : test.layoutVersion + 1,
      finalizedAt: new Date().toISOString()
    })
    if (!updated) throw new AppError('NOT_FOUND', `Test ${id} not found`)
    this.notifyKeyChange(id)
    return updated
  }

  /** Back to draft. The stored layout stays so already-printed sheets remain gradeable. */
  unlock(id: number): Test {
    const test = this.get(id)
    if (test.status === 'draft') return test
    const updated = this.repo.update(id, { status: 'draft' })
    if (!updated) throw new AppError('NOT_FOUND', `Test ${id} not found`)
    return updated
  }

  copy(input: TestCopyInput): Test {
    const parsed = TestCopyInputSchema.parse(input)
    const source = this.get(parsed.id)
    this.requireSection(parsed.sectionId)
    return this.repo.insert({
      sectionId: parsed.sectionId,
      title: parsed.title ?? source.title,
      instructions: source.instructions,
      questions: source.questions.map((q) => ({ stem: q.stem, choices: q.choices, correctChoice: q.correctChoice }))
    })
  }

  remove(id: number): void {
    this.get(id)
    this.repo.delete(id)
  }

  private requireSection(sectionId: number): void {
    if (!this.sections.findById(sectionId)) throw new AppError('NOT_FOUND', `Section ${sectionId} not found`)
  }
}

