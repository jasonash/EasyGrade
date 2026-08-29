import type {
  AnswerSheetUpdateInput,
  Test,
  TestCopyInput,
  TestCreateInput,
  TestKeyUpdate,
  TestSummary,
  TestUpdateInput
} from '@shared/types'
import {
  AnswerSheetUpdateInputSchema,
  DEFAULT_ANSWER_SHEET_QUESTIONS,
  DEFAULT_BUBBLE_COUNT,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_TEST_TITLE,
  FinalTestSchema,
  TestCopyInputSchema,
  TestCreateInputSchema,
  TestKeyUpdateSchema,
  TestUpdateInputSchema,
  TitleSchema
} from '@shared/schemas'
import { answerSheetCapacity, buildAnswerSheetLayout, buildSheetLayout, measureTest, type SheetLayout } from '@shared/layout'
import type { QuestionInsert, TestRepository } from '../db/repositories/test.repo'
import type { SectionRepository } from '../db/repositories/section.repo'
import { AppError } from './errors'
import { describeFinalizeIssue } from '@shared/test-validation'

/** Kept for callers that import it from here; the value lives in the shared schema. */
export const DEFAULT_TITLE = DEFAULT_TEST_TITLE

function blankQuestion(): QuestionInsert {
  return { stem: '', choices: ['', '', '', ''], correctChoice: 0 }
}

/** An answer-sheet row: no text, just `count` bubbles. */
function blankRow(count: number): QuestionInsert {
  return { stem: '', choices: Array.from({ length: count }, () => ''), correctChoice: 0, labelStyle: 'letters', countOverridden: false }
}

function normalizeLink(url: string): string | null {
  return url === '' ? null : url
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

  /**
   * New draft with the default instructions. Standard tests start with one
   * blank question; answer sheets with a handful of rows at the default
   * bubble count so the editor has something to show.
   */
  create(input: TestCreateInput): Test {
    const parsed = TestCreateInputSchema.parse(input)
    this.requireSection(parsed.sectionId)
    const title = parsed.title === '' ? DEFAULT_TITLE : parsed.title
    if ((parsed.kind ?? 'standard') === 'standard') {
      return this.repo.insert({
        sectionId: parsed.sectionId,
        kind: 'standard',
        title,
        instructions: DEFAULT_INSTRUCTIONS,
        questions: [blankQuestion()]
      })
    }
    const defaultChoiceCount = parsed.defaultChoiceCount ?? DEFAULT_BUBBLE_COUNT
    const questionCount = parsed.questionCount ?? DEFAULT_ANSWER_SHEET_QUESTIONS
    this.requireCapacity(questionCount, defaultChoiceCount)
    return this.repo.insert({
      sectionId: parsed.sectionId,
      kind: 'answer_sheet',
      title,
      instructions: DEFAULT_INSTRUCTIONS,
      defaultChoiceCount,
      linkUrl: null,
      questions: Array.from({ length: questionCount }, () => blankRow(defaultChoiceCount))
    })
  }

  /** Standard-test edits (text and choices). Drafts only. */
  update(input: TestUpdateInput): Test {
    const parsed = TestUpdateInputSchema.parse(input)
    const test = this.get(parsed.id)
    if (test.kind !== 'standard') {
      throw new AppError('CONFLICT', 'This test is an answer sheet; edit it with the answer-sheet editor.')
    }
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

  /**
   * Answer-sheet edits. A draft takes everything. A finalized sheet keeps its
   * printed geometry (title, instructions, bubble counts, question count,
   * label styles) and accepts only the key and the link.
   */
  updateAnswerSheet(input: AnswerSheetUpdateInput): Test {
    const parsed = AnswerSheetUpdateInputSchema.parse(input)
    const test = this.get(parsed.id)
    if (test.kind !== 'answer_sheet') {
      throw new AppError('CONFLICT', 'This is a standard test; edit it with the test editor.')
    }
    this.requireCapacity(parsed.questions.length, parsed.defaultChoiceCount)

    if (test.status === 'finalized') {
      const sameShape =
        parsed.title === test.title &&
        parsed.instructions === test.instructions &&
        parsed.defaultChoiceCount === test.defaultChoiceCount &&
        parsed.questions.length === test.questions.length &&
        parsed.questions.every((q, i) => {
          const current = test.questions[i]
          return current !== undefined && q.choiceCount === current.choices.length && q.labelStyle === current.labelStyle
        })
      if (!sameShape) {
        throw new AppError('CONFLICT', 'This answer sheet is finalized. Unlock it to change the title, instructions, or bubbles.')
      }
      this.repo.update(parsed.id, { linkUrl: normalizeLink(parsed.linkUrl) })
      const key = parsed.questions.map((q) => q.correctChoice)
      if (key.some((choice, i) => choice !== test.questions[i]?.correctChoice)) {
        this.repo.updateKey(parsed.id, key)
        this.notifyKeyChange(parsed.id)
      }
      return this.get(parsed.id)
    }

    this.repo.replaceQuestions(
      parsed.id,
      parsed.questions.map((q) => ({
        stem: '',
        choices: Array.from({ length: q.choiceCount }, () => ''),
        correctChoice: q.correctChoice,
        labelStyle: q.labelStyle,
        countOverridden: q.countOverridden
      }))
    )
    const updated = this.repo.update(parsed.id, {
      title: parsed.title,
      instructions: parsed.instructions,
      linkUrl: normalizeLink(parsed.linkUrl),
      defaultChoiceCount: parsed.defaultChoiceCount
    })
    if (!updated) throw new AppError('NOT_FOUND', `Test ${parsed.id} not found`)
    return updated
  }

  /** Change the answer key without touching the layout. Works on finalized tests of either kind. */
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

    const layout = test.kind === 'answer_sheet' ? this.answerSheetLayout(test) : this.standardLayout(test)
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

  private standardLayout(test: Test): SheetLayout {
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
    return buildSheetLayout(strict.data.questions.map((q) => q.choices.length))
  }

  private answerSheetLayout(test: Test): SheetLayout {
    const title = TitleSchema.safeParse(test.title)
    if (!title.success) throw new AppError('VALIDATION', `Title: ${title.error.issues[0]?.message ?? 'Title is required'}`)
    test.questions.forEach((q, i) => {
      if (q.correctChoice >= q.choices.length) {
        throw new AppError('VALIDATION', `Question ${i + 1}: The correct answer must be one of the choices`)
      }
    })
    try {
      return buildAnswerSheetLayout(
        test.questions.map((q) => q.choices.length),
        test.defaultChoiceCount ?? DEFAULT_BUBBLE_COUNT
      )
    } catch (err) {
      if (err instanceof RangeError) throw new AppError('VALIDATION', err.message)
      throw err
    }
  }

  /** Back to draft. The stored layout stays so already-printed sheets remain gradeable. */
  unlock(id: number): Test {
    const test = this.get(id)
    if (test.status === 'draft') return test
    const updated = this.repo.update(id, { status: 'draft' })
    if (!updated) throw new AppError('NOT_FOUND', `Test ${id} not found`)
    return updated
  }

  /** New draft with the same content (and, for answer sheets, the same bubbles and link) in any section. */
  copy(input: TestCopyInput): Test {
    const parsed = TestCopyInputSchema.parse(input)
    const source = this.get(parsed.id)
    this.requireSection(parsed.sectionId)
    return this.repo.insert({
      sectionId: parsed.sectionId,
      kind: source.kind,
      title: parsed.title ?? source.title,
      instructions: source.instructions,
      defaultChoiceCount: source.defaultChoiceCount,
      linkUrl: source.linkUrl,
      questions: source.questions.map((q) => ({
        stem: q.stem,
        choices: q.choices,
        correctChoice: q.correctChoice,
        labelStyle: q.labelStyle,
        countOverridden: q.countOverridden
      }))
    })
  }

  remove(id: number): void {
    this.get(id)
    this.repo.delete(id)
  }

  private requireCapacity(questionCount: number, defaultChoiceCount: number): void {
    const { capacity } = answerSheetCapacity(defaultChoiceCount)
    if (questionCount > capacity) {
      throw new AppError(
        'VALIDATION',
        `Only ${capacity} questions fit on one page with ${defaultChoiceCount} bubbles each; this sheet has ${questionCount}`
      )
    }
  }

  private requireSection(sectionId: number): void {
    if (!this.sections.findById(sectionId)) throw new AppError('NOT_FOUND', `Section ${sectionId} not found`)
  }
}
