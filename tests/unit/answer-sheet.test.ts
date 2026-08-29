import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { TestRepository } from '../../src/main/db/repositories/test.repo'
import { SectionService } from '../../src/main/services/section.service'
import { TestService } from '../../src/main/services/test.service'
import { AppError } from '../../src/main/services/errors'
import { parseAnswerKey } from '../../src/shared/answer-key-import'
import {
  AS_GRID_LEFT,
  AS_GRID_RIGHT,
  AS_GRID_TOP,
  AS_ROW_PITCH,
  BUBBLE_RADIUS,
  CHOICE_LETTERS,
  GRID_BOTTOM,
  MAX_SHEET_QUESTIONS,
  answerSheetCapacity,
  bubbleCenter,
  buildAnswerSheetLayout,
  buildSheetLayout,
  layoutKind,
  questionBox
} from '../../src/shared/layout'
import {
  AnswerSheetUpdateInputSchema,
  DEFAULT_ANSWER_SHEET_QUESTIONS,
  DEFAULT_BUBBLE_COUNT,
  DEFAULT_INSTRUCTIONS,
  SheetLayoutSchema
} from '../../src/shared/schemas'
import type { AnswerSheetQuestionInput, LabelStyle } from '../../src/shared/types'

const row = (choiceCount: number, correctChoice = 0, labelStyle: LabelStyle = 'letters', countOverridden = false): AnswerSheetQuestionInput => ({
  choiceCount,
  correctChoice,
  labelStyle,
  countOverridden
})

describe('answer-sheet layout', () => {
  it('sizes columns from the default bubble count', () => {
    const table = [2, 3, 4, 5, 6, 7, 8].map((n) => {
      const c = answerSheetCapacity(n)
      return [n, c.columns, c.capacity]
    })
    expect(table).toEqual([
      [2, 4, 96],
      [3, 4, 96],
      [4, 4, 96],
      [5, 3, 72],
      [6, 2, 48],
      [7, 2, 48],
      [8, 2, 48]
    ])
    expect(answerSheetCapacity(4).capacity).toBe(MAX_SHEET_QUESTIONS)
    expect(() => answerSheetCapacity(1)).toThrow(RangeError)
    expect(() => answerSheetCapacity(9)).toThrow(RangeError)
  })

  it('lays questions down each column and keeps every bubble inside the grid', () => {
    const counts = [...Array<number>(50).fill(5), ...Array<number>(10).fill(2)]
    const layout = buildAnswerSheetLayout(counts, 5)
    expect(layout.kind).toBe('answer_sheet')
    expect(layout.columns).toBe(3)
    expect(layout.rowPitch).toBe(AS_ROW_PITCH)
    expect(layout.questionCount).toBe(60)
    expect(layout.cells).toHaveLength(60)
    expect(layout.bubbleX).toEqual([])
    expect(layout.rowY).toHaveLength(60)
    expect(layout.slotTop).toHaveLength(60)
    const first = layout.cells?.[0]
    const twentyFifth = layout.cells?.[24]
    const last = layout.cells?.[59]
    expect(first).toMatchObject({ column: 0, row: 0, left: AS_GRID_LEFT, top: AS_GRID_TOP })
    expect(twentyFifth).toMatchObject({ column: 1, row: 0, top: AS_GRID_TOP })
    expect(last).toMatchObject({ column: 2, row: 11 })
    expect(first?.x).toHaveLength(5)
    expect(last?.x).toHaveLength(2)
    expect(last?.x[0]).toBe(twentyFifth?.x[0] === undefined ? NaN : twentyFifth.x[0] + (first?.width ?? 0) + 14)
    for (const cell of layout.cells ?? []) {
      expect(cell.top + cell.height).toBeLessThanOrEqual(GRID_BOTTOM)
      for (const x of cell.x) expect(x + BUBBLE_RADIUS).toBeLessThanOrEqual(AS_GRID_RIGHT)
      expect(cell.x[0]).toBeGreaterThan(cell.left)
    }
    // rowY and slotTop mirror the cells so consumers that only read those still work.
    expect(layout.rowY[24]).toBe(twentyFifth?.y)
    expect(layout.slotTop[59]).toBe(last?.top)
  })

  it('refuses sheets that do not fit or rows wider than the default', () => {
    expect(() => buildAnswerSheetLayout(Array<number>(73).fill(5), 5)).toThrow(/at most 72/)
    expect(() => buildAnswerSheetLayout([4, 6], 5)).toThrow(/Question 2 has 6 bubbles/)
    expect(() => buildAnswerSheetLayout([4, 1], 5)).toThrow(/Question 2 has 1 bubbles/)
    expect(() => buildAnswerSheetLayout([], 5)).toThrow(/at least one/)
    expect(buildAnswerSheetLayout(Array<number>(96).fill(4), 4).cells).toHaveLength(96)
  })

  it('reads bubble centers and question boxes for both layout kinds', () => {
    const standard = buildSheetLayout([4, 2])
    expect(layoutKind(standard)).toBe('standard')
    expect(bubbleCenter(standard, 1, 1)).toEqual([standard.bubbleX[1], standard.rowY[1]])
    expect(bubbleCenter(standard, 1, 2)).toBeNull()
    expect(bubbleCenter(standard, 5, 0)).toBeNull()
    expect(questionBox(standard, 1, 50, 587)).toEqual([50, standard.slotTop[1], 537, standard.slotHeight])

    const sheet = buildAnswerSheetLayout([3, 2, 5], 5)
    expect(layoutKind(sheet)).toBe('answer_sheet')
    const cell = sheet.cells?.[2]
    expect(bubbleCenter(sheet, 2, 4)).toEqual([cell?.x[4], cell?.y])
    expect(bubbleCenter(sheet, 1, 2)).toBeNull()
    expect(questionBox(sheet, 2, 50, 587)).toEqual([cell?.left, cell?.top, cell?.width, cell?.height])

    // Layouts stored before answer sheets existed have no kind and still read as standard.
    const legacy = SheetLayoutSchema.parse({ ...standard, kind: undefined })
    expect(layoutKind(legacy)).toBe('standard')
    expect(bubbleCenter(legacy, 0, 3)).toEqual([standard.bubbleX[3], standard.rowY[0]])
    expect(SheetLayoutSchema.parse(JSON.parse(JSON.stringify(sheet)))).toEqual(sheet)
  })

  it('knows eight letters', () => {
    expect(CHOICE_LETTERS).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  })
})

describe('parseAnswerKey', () => {
  const letters = (n: number, count = 4) => Array.from({ length: n }, () => ({ choiceCount: count, labelStyle: 'letters' as const }))
  const tf = { choiceCount: 2, labelStyle: 'true_false' as const }

  it('reads numbered entries in any common punctuation, across lines or run together', () => {
    const rows = letters(6)
    expect(parseAnswerKey('1. B\n2) D\n3: A\n4-C\nQ5 b\nQuestion 6: D', rows)).toMatchObject({
      answers: [1, 3, 0, 2, 1, 3],
      found: 6,
      issues: [],
      error: null
    })
    expect(parseAnswerKey('1. B  2. D  3. A  4. C  5. B  6. D', rows).answers).toEqual([1, 3, 0, 2, 1, 3])
    expect(parseAnswerKey('**1.** B\n**2.** D\n3. A\n4. C\n5. B\n6. D', rows).answers).toEqual([1, 3, 0, 2, 1, 3])
  })

  it('reads a bare sequence with spaces, commas, or nothing between letters', () => {
    const rows = letters(4)
    expect(parseAnswerKey('B D A C', rows).answers).toEqual([1, 3, 0, 2])
    expect(parseAnswerKey('B, D, A, C', rows).answers).toEqual([1, 3, 0, 2])
    expect(parseAnswerKey('BDAC', rows).answers).toEqual([1, 3, 0, 2])
    expect(parseAnswerKey('b d a c', rows).answers).toEqual([1, 3, 0, 2])
    // Lowercase prose is not a run of answers.
    expect(parseAnswerKey('the cat', rows).error).not.toBeNull()
  })

  it('handles true/false rows and T/F on letter rows', () => {
    const rows = [tf, tf, tf, tf, ...letters(1)]
    const result = parseAnswerKey('1. T 2. False 3. A 4. true 5. F', rows)
    expect(result.answers).toEqual([0, 1, 0, 0, 1])
    expect(result.issues).toEqual(['Question 5: F taken as B'])
    expect(parseAnswerKey('1. C', [tf])).toMatchObject({ answers: [null], found: 0, issues: ['Question 1: "C" is not T or F'] })
  })

  it('reports letters beyond a row, duplicates, extras, and missing rows without failing', () => {
    const rows = [...letters(2), { choiceCount: 2, labelStyle: 'letters' as const }, ...letters(1)]
    const result = parseAnswerKey('1. A 2. B 3. E 2. C 5. A 6. B', rows)
    expect(result.answers).toEqual([0, 2, null, null])
    expect(result.found).toBe(2)
    expect(result.issues).toEqual([
      'Question 3: E is beyond its 2 bubbles',
      'Question 2 appears more than once; the last one wins',
      '2 entries are numbered past question 4 and were ignored',
      '1 question was not in the paste and keeps the current answer'
    ])
    expect(result.error).toBeNull()

    const sequence = parseAnswerKey('A B C D E', letters(3))
    expect(sequence.answers).toEqual([0, 1, 2])
    expect(sequence.issues).toEqual(['Found 5 answers but the sheet has 3 questions; the extra 2 were ignored'])

    const short = parseAnswerKey('A B', letters(4))
    expect(short.answers).toEqual([0, 1, null, null])
    expect(short.issues).toEqual(['2 questions were not in the paste and keep the current answer'])
  })

  it('says so when nothing usable was pasted', () => {
    expect(parseAnswerKey('', letters(3))).toMatchObject({ answers: [null, null, null], found: 0, error: expect.stringContaining('No answers found') })
    expect(parseAnswerKey('Answer key coming soon', letters(3)).error).not.toBeNull()
    expect(parseAnswerKey('7. A 8. B', letters(3)).error).toMatch(/No answers matched/)
  })
})

describe('TestService answer sheets', () => {
  let db: Db
  let service: TestService
  let sectionId: number
  let otherSectionId: number
  let keyChanges: number[]

  beforeEach(() => {
    db = openDatabase({ path: ':memory:' })
    const sectionRepo = new SectionRepository(db)
    const sections = new SectionService(sectionRepo)
    service = new TestService(new TestRepository(db), sectionRepo)
    keyChanges = []
    service.onKeyChange((id) => keyChanges.push(id))
    sectionId = sections.create({ name: 'Biology 2', schoolYear: '2026-27' }).id
    otherSectionId = sections.create({ name: 'Biology 5', schoolYear: '2026-27' }).id
  })

  function sheet(questionCount = 4, defaultChoiceCount = 5) {
    return service.create({ sectionId, title: 'Unit 3 Exam', kind: 'answer_sheet', questionCount, defaultChoiceCount })
  }

  function draftInput(test: ReturnType<typeof sheet>, questions: AnswerSheetQuestionInput[], extra: Partial<{ title: string; instructions: string; linkUrl: string; defaultChoiceCount: number }> = {}) {
    return {
      id: test.id,
      title: extra.title ?? test.title,
      instructions: extra.instructions ?? test.instructions,
      linkUrl: extra.linkUrl ?? test.linkUrl ?? '',
      defaultChoiceCount: extra.defaultChoiceCount ?? test.defaultChoiceCount ?? DEFAULT_BUBBLE_COUNT,
      questions
    }
  }

  it('creates an answer sheet with blank rows at the default bubble count', () => {
    const test = service.create({ sectionId, title: 'Final', kind: 'answer_sheet' })
    expect(test.kind).toBe('answer_sheet')
    expect(test.defaultChoiceCount).toBe(DEFAULT_BUBBLE_COUNT)
    expect(test.linkUrl).toBeNull()
    expect(test.attachment).toBeNull()
    expect(test.instructions).toBe(DEFAULT_INSTRUCTIONS)
    expect(test.questions).toHaveLength(DEFAULT_ANSWER_SHEET_QUESTIONS)
    expect(test.questions[0]).toMatchObject({ stem: '', choices: ['', '', '', '', ''], correctChoice: 0, labelStyle: 'letters', countOverridden: false })
    expect(service.list(sectionId)[0]?.kind).toBe('answer_sheet')

    const standard = service.create({ sectionId, title: 'Quiz' })
    expect(standard.kind).toBe('standard')
    expect(standard.defaultChoiceCount).toBeNull()

    const wide = service.create({ sectionId, title: 'Wide', kind: 'answer_sheet', defaultChoiceCount: 8, questionCount: 48 })
    expect(wide.questions).toHaveLength(48)
    expect(wide.questions[47]?.choices).toHaveLength(8)
    expect(() => service.create({ sectionId, title: 'Too many', kind: 'answer_sheet', defaultChoiceCount: 5, questionCount: 73 })).toThrow(
      /Only 72 questions fit/
    )
  })

  it('keeps the two editors apart', () => {
    const test = sheet()
    expect(() => service.update({ id: test.id, title: 'x', instructions: '', questions: [{ stem: '', choices: ['', ''], correctChoice: 0 }] })).toThrow(
      /answer sheet/
    )
    const standard = service.create({ sectionId, title: 'Quiz' })
    expect(() => service.updateAnswerSheet(draftInput(standard as never, [row(4)], { defaultChoiceCount: 4 }))).toThrow(/standard test/)
  })

  it('updates a draft: rows, overrides, true/false, link, default count', () => {
    const test = sheet(3)
    const updated = service.updateAnswerSheet(
      draftInput(test, [row(4, 2), row(2, 1, 'true_false', true), row(4, 3), row(3, 0, 'letters', true)], {
        title: 'Unit 3 Exam v2',
        instructions: 'Questions 2 is true/false.',
        linkUrl: ' https://docs.google.com/document/d/abc ',
        defaultChoiceCount: 4
      })
    )
    expect(updated.title).toBe('Unit 3 Exam v2')
    expect(updated.defaultChoiceCount).toBe(4)
    expect(updated.linkUrl).toBe('https://docs.google.com/document/d/abc')
    expect(updated.questions.map((q) => q.choices.length)).toEqual([4, 2, 4, 3])
    expect(updated.questions.map((q) => q.correctChoice)).toEqual([2, 1, 3, 0])
    expect(updated.questions.map((q) => q.labelStyle)).toEqual(['letters', 'true_false', 'letters', 'letters'])
    expect(updated.questions.map((q) => q.countOverridden)).toEqual([false, true, false, true])
    expect(updated.questions.every((q) => q.stem === '' && q.choices.every((c) => c === ''))).toBe(true)

    const cleared = service.updateAnswerSheet(draftInput(updated, [row(4)], { linkUrl: '' }))
    expect(cleared.linkUrl).toBeNull()
    expect(cleared.questions).toHaveLength(1)
    expect(keyChanges).toEqual([])
  })

  it('validates rows before touching the database', () => {
    const test = sheet(2)
    expect(() => service.updateAnswerSheet(draftInput(test, [row(6)], { defaultChoiceCount: 5 }))).toThrow(/more bubbles than the default/)
    expect(() => service.updateAnswerSheet(draftInput(test, [row(3, 0, 'true_false')]))).toThrow(/exactly two bubbles/)
    expect(() => service.updateAnswerSheet(draftInput(test, [row(4, 4)]))).toThrow(/must be one of the choices/)
    expect(() => service.updateAnswerSheet(draftInput(test, [row(4)], { linkUrl: 'docs.google.com/abc' }))).toThrow(/http/)
    expect(() => service.updateAnswerSheet(draftInput(test, Array.from({ length: 73 }, () => row(5))))).toThrow(/Only 72 questions fit/)
    expect(AnswerSheetUpdateInputSchema.safeParse(draftInput(test, [])).success).toBe(false)
    expect(service.get(test.id).questions).toHaveLength(2)
  })

  it('finalizes with an answer-sheet layout and then locks the geometry but not the key or link', () => {
    const test = sheet(3)
    service.updateAnswerSheet(draftInput(test, [row(5, 1), row(2, 0, 'true_false', true), row(5, 4)]))
    const finalized = service.finalize(test.id)
    expect(finalized.status).toBe('finalized')
    expect(finalized.layout?.kind).toBe('answer_sheet')
    expect(finalized.layout?.columns).toBe(3)
    expect(finalized.layout?.cells).toHaveLength(3)
    expect(finalized.layout?.choiceCounts).toEqual([5, 2, 5])
    expect(finalized.layoutVersion).toBe(1)
    expect(keyChanges).toEqual([test.id])

    // Key and link changes go through; the listener fires once for the key.
    const rekeyed = service.updateAnswerSheet(
      draftInput(finalized, [row(5, 2), row(2, 0, 'true_false', true), row(5, 4)], { linkUrl: 'https://example.com/exam.pdf' })
    )
    expect(rekeyed.status).toBe('finalized')
    expect(rekeyed.questions.map((q) => q.correctChoice)).toEqual([2, 0, 4])
    expect(rekeyed.linkUrl).toBe('https://example.com/exam.pdf')
    expect(rekeyed.layoutVersion).toBe(1)
    expect(keyChanges).toEqual([test.id, test.id])

    // Only the link, no listener.
    service.updateAnswerSheet(draftInput(rekeyed, [row(5, 2), row(2, 0, 'true_false', true), row(5, 4)], { linkUrl: '' }))
    expect(keyChanges).toHaveLength(2)
    expect(service.get(test.id).linkUrl).toBeNull()

    // Geometry changes are refused while finalized.
    const locked = /Unlock it/
    expect(() => service.updateAnswerSheet(draftInput(rekeyed, [row(4, 2), row(2, 0, 'true_false', true), row(5, 4)]))).toThrow(locked)
    expect(() => service.updateAnswerSheet(draftInput(rekeyed, [row(5, 2), row(2, 0, 'true_false', true)]))).toThrow(locked)
    expect(() => service.updateAnswerSheet(draftInput(rekeyed, [row(5, 2), row(2, 0), row(5, 4)]))).toThrow(locked)
    expect(() => service.updateAnswerSheet(draftInput(rekeyed, [row(5, 2), row(2, 0, 'true_false', true), row(5, 4)], { title: 'Renamed' }))).toThrow(locked)
    expect(() => service.updateAnswerSheet(draftInput(rekeyed, [row(5, 2), row(2, 0, 'true_false', true), row(5, 4)], { defaultChoiceCount: 6 }))).toThrow(locked)

    // Unlock, reshape, re-finalize: the layout version bumps.
    service.unlock(test.id)
    service.updateAnswerSheet(draftInput(service.get(test.id), [row(4, 1), row(4, 2)], { defaultChoiceCount: 4 }))
    const again = service.finalize(test.id)
    expect(again.layoutVersion).toBe(2)
    expect(again.layout?.columns).toBe(4)
    expect(again.layout?.choiceCounts).toEqual([4, 4])
  })

  it('refuses to finalize without a title and accepts an eight-bubble key', () => {
    const untitled = service.create({ sectionId, title: '', kind: 'answer_sheet', defaultChoiceCount: 8, questionCount: 2 })
    service.updateAnswerSheet(draftInput(untitled, [row(8, 7), row(8, 0)], { title: '' }))
    expect(() => service.finalize(untitled.id)).toThrow(AppError)
    expect(() => service.finalize(untitled.id)).toThrow(/Title/)
    service.updateAnswerSheet(draftInput(service.get(untitled.id), [row(8, 7), row(8, 0)], { title: 'Big' }))
    service.finalize(untitled.id)
    const keyed = service.updateKey({ id: untitled.id, correctChoices: [6, 7] })
    expect(keyed.questions.map((q) => q.correctChoice)).toEqual([6, 7])
    expect(() => service.updateKey({ id: untitled.id, correctChoices: [8, 0] })).toThrow(/no choice 9/)
  })

  it('copies an answer sheet with its bubbles, styles, overrides, and link', () => {
    const test = sheet(2, 4)
    service.updateAnswerSheet(draftInput(test, [row(4, 3), row(2, 1, 'true_false', true)], { linkUrl: 'https://example.com/doc' }))
    const copy = service.copy({ id: test.id, sectionId: otherSectionId })
    expect(copy.id).not.toBe(test.id)
    expect(copy.code).not.toBe(test.code)
    expect(copy.kind).toBe('answer_sheet')
    expect(copy.status).toBe('draft')
    expect(copy.sectionId).toBe(otherSectionId)
    expect(copy.defaultChoiceCount).toBe(4)
    expect(copy.linkUrl).toBe('https://example.com/doc')
    expect(copy.questions.map((q) => [q.choices.length, q.correctChoice, q.labelStyle, q.countOverridden])).toEqual([
      [4, 3, 'letters', false],
      [2, 1, 'true_false', true]
    ])
  })
})
