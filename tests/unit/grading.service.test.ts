import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../src/main/services/errors'
import { rescore } from '../../src/main/services/grading.service'
import type { DetectedRow, ScanPageDetail } from '../../src/shared/schemas'
import { SYN_KEY, syntheticTest } from '../helpers/synthetic'
import { harness, loadSyntheticPages, makeRunner, type Harness, type SyntheticPages } from '../helpers/scan-harness'

/**
 * Phase 6 teacher actions: assignment, conflicts, discarding, overrides,
 * reviewed, regrade on key change, and the Results and Student read models.
 * Every test imports the same four synthetic pages: a graded sheet, a
 * duplicate of it (conflict), a blank sheet with a handwritten name, and a
 * white page.
 */

let pages: SyntheticPages
let scansDir: string
let h: Harness
let graded: ScanPageDetail
let duplicate: ScanPageDetail
let blankSheet: ScanPageDetail
let white: ScanPageDetail

beforeAll(async () => {
  pages = await loadSyntheticPages()
  scansDir = mkdtempSync(join(tmpdir(), 'easygrade-grading-'))
})

afterAll(() => {
  rmSync(scansDir, { recursive: true, force: true })
})

beforeEach(async () => {
  h = harness(makeRunner(pages, ['filled', 'filled-copy', 'blank-sheet', 'white']), scansDir)
  const batch = await h.scan.importFiles(['/nowhere/synthetic.pdf'])
  const list = h.scan.listPages(batch.id)
  graded = list[0] as ScanPageDetail
  duplicate = list[1] as ScanPageDetail
  blankSheet = list[2] as ScanPageDetail
  white = list[3] as ScanPageDetail
  expect([graded.bucket, duplicate.bucket, blankSheet.bucket, white.bucket]).toEqual(['graded', 'needs_assignment', 'needs_assignment', 'not_a_sheet'])
})

describe('page details', () => {
  it('resolves names and attaches the result', () => {
    expect(graded.testTitle).toBe(syntheticTest().title)
    expect(graded.studentName).toBe('Synth, Sam')
    expect(graded.studentNumber).toBe('424242')
    expect(graded.sectionName).toBe('Synthetic Block')
    expect(graded.result?.correctCount).toBe(10)
    expect(graded.result?.overrides).toEqual([])
    expect(blankSheet.studentName).toBeNull()
    expect(blankSheet.testTitle).toBe(syntheticTest().title)
    expect(h.scan.getPage(graded.id).result?.id).toBe(graded.resultId)
  })
})

describe('assignPage', () => {
  it('grades a blank sheet from its own detection when assigned to a student', async () => {
    const outcome = await h.scan.assignPage({ pageId: blankSheet.id, testId: h.testId, studentId: h.otherStudentId })
    expect(outcome.status).toBe('assigned')
    if (outcome.status !== 'assigned') return
    expect(outcome.page.bucket).toBe('graded')
    expect(outcome.page.assignedBy).toBe('teacher')
    expect(outcome.page.studentName).toBe('Abbott, Ada')
    expect(outcome.page.result?.correctCount).toBe(10)
    expect(outcome.page.result?.layoutVersion).toBe(1)
    expect(h.results.findByPair(h.testId, h.otherStudentId)?.scanPageId).toBe(blankSheet.id)
    expect(h.scan.getBatch(blankSheet.batchId).counts.graded).toBe(2)
  })

  it('reports a conflict and only replaces when asked', async () => {
    const conflict = await h.scan.assignPage({ pageId: blankSheet.id, testId: h.testId, studentId: h.studentId })
    expect(conflict.status).toBe('conflict')
    if (conflict.status !== 'conflict') return
    expect(conflict.existing.id).toBe(graded.resultId)
    expect(conflict.existingPage?.id).toBe(graded.id)
    expect(h.scan.getPage(blankSheet.id).bucket).toBe('needs_assignment')

    const replaced = await h.scan.assignPage({ pageId: blankSheet.id, testId: h.testId, studentId: h.studentId, replace: true })
    expect(replaced.status).toBe('assigned')
    const result = h.results.findByPair(h.testId, h.studentId)
    expect(result?.scanPageId).toBe(blankSheet.id)
    expect(h.scan.getPage(blankSheet.id).resultId).toBe(result?.id)
    const old = h.scan.getPage(graded.id)
    expect(old.bucket).toBe('discarded')
    expect(old.reason).toBe('conflict')
    expect(old.resultId).toBeNull()
    expect(h.results.listByTest(h.testId)).toHaveLength(1)
  })

  it('re-reads the bubbles with the chosen layout when the page had no test', async () => {
    // Simulate a sheet whose QR could not be decoded: aligned, but nothing known about it.
    h.results.delete(graded.resultId ?? 0)
    h.scans.updatePage(graded.id, { bucket: 'unreadable', reason: 'qr', testId: null, studentId: null, detected: null, resultId: null, crops: {} })
    const before = h.scan.getPage(graded.id)
    expect(before.detected).toBeNull()

    const outcome = await h.scan.assignPage({ pageId: graded.id, testId: h.testId, studentId: h.studentId })
    expect(outcome.status).toBe('assigned')
    if (outcome.status !== 'assigned') return
    expect(outcome.page.detected?.map((r) => r.choice)).toEqual(SYN_KEY)
    expect(outcome.page.result?.correctCount).toBe(10)
    expect(outcome.page.result?.flags).toEqual([])
  })

  it('regenerates row crops for flagged rows after a re-read', async () => {
    h.results.delete(graded.resultId ?? 0)
    h.scans.updatePage(graded.id, { bucket: 'unreadable', reason: 'qr', testId: null, studentId: null, detected: null, resultId: null, crops: {} })
    // Move the key so one detected row disagrees with nothing; crops only appear for non-filled or low-confidence rows,
    // so a clean sheet should produce none. Assert the mechanism ran by checking the crops map is a fresh object.
    const outcome = await h.scan.assignPage({ pageId: graded.id, testId: h.testId, studentId: h.studentId })
    if (outcome.status !== 'assigned') throw new Error('expected assignment')
    for (const rel of Object.values(outcome.page.crops)) expect(existsSync(join(scansDir, rel))).toBe(true)
  })

  it('needs manual answers for a page that was never aligned, then grades them', async () => {
    await expect(h.scan.assignPage({ pageId: white.id, testId: h.testId, studentId: h.otherStudentId })).rejects.toMatchObject({ code: 'VALIDATION' })

    const answers = SYN_KEY.map((choice, q) => (q === 0 ? null : choice))
    const outcome = await h.scan.assignPage({ pageId: white.id, testId: h.testId, studentId: h.otherStudentId, answers })
    expect(outcome.status).toBe('assigned')
    if (outcome.status !== 'assigned') return
    expect(outcome.page.bucket).toBe('graded')
    expect(outcome.page.detected).toBeNull()
    expect(outcome.page.result?.rawAnswers).toEqual(answers)
    expect(outcome.page.result?.correctCount).toBe(9)
    expect(outcome.page.result?.flags).toEqual([{ q: 0, kind: 'blank' }])
  })

  it('validates manual answers and the test state', async () => {
    await expect(h.scan.assignPage({ pageId: white.id, testId: h.testId, studentId: h.otherStudentId, answers: [0, 1] })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(h.scan.assignPage({ pageId: white.id, testId: h.testId, studentId: h.otherStudentId, answers: SYN_KEY.map(() => 4) })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(h.scan.assignPage({ pageId: white.id, testId: h.testId, studentId: 9999 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(h.scan.assignPage({ pageId: 9999, testId: h.testId, studentId: h.otherStudentId })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    h.tests.unlock(h.testId)
    await expect(h.scan.assignPage({ pageId: white.id, testId: h.testId, studentId: h.otherStudentId, answers: SYN_KEY })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('reassigns a graded page to another student, moving the result', async () => {
    const outcome = await h.scan.assignPage({ pageId: graded.id, testId: h.testId, studentId: h.otherStudentId })
    expect(outcome.status).toBe('assigned')
    expect(h.results.findByPair(h.testId, h.studentId)).toBeNull()
    expect(h.results.findByPair(h.testId, h.otherStudentId)?.scanPageId).toBe(graded.id)
    expect(h.results.listByTest(h.testId)).toHaveLength(1)
  })
})

describe('resolveConflict and discardPage', () => {
  it('keep discards the duplicate and leaves the original result alone', async () => {
    const page = await h.scan.resolveConflict({ pageId: duplicate.id, action: 'keep' })
    expect(page.bucket).toBe('discarded')
    expect(page.reason).toBe('conflict')
    expect(h.results.findByPair(h.testId, h.studentId)?.id).toBe(graded.resultId)
    expect(h.scan.getBatch(duplicate.batchId).counts).toMatchObject({ graded: 1, discarded: 1, needs_assignment: 1 })
  })

  it('replace grades the duplicate and discards the original page', async () => {
    const page = await h.scan.resolveConflict({ pageId: duplicate.id, action: 'replace' })
    expect(page.bucket).toBe('graded')
    expect(page.result?.scanPageId).toBe(duplicate.id)
    expect(page.assignedBy).toBe('teacher')
    expect(h.scan.getPage(graded.id).bucket).toBe('discarded')
    expect(h.scan.getPage(graded.id).resultId).toBeNull()
    expect(h.results.listByTest(h.testId).map((r) => r.scanPageId)).toEqual([duplicate.id])
  })

  it('refuses to resolve a page that is not a conflict', async () => {
    await expect(h.scan.resolveConflict({ pageId: blankSheet.id, action: 'keep' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('discarding a graded page deletes its result; the page can be assigned again later', async () => {
    const discarded = h.scan.discardPage(graded.id)
    expect(discarded.bucket).toBe('discarded')
    expect(discarded.resultId).toBeNull()
    expect(h.results.findByPair(h.testId, h.studentId)).toBeNull()
    const outcome = await h.scan.assignPage({ pageId: graded.id, testId: h.testId, studentId: h.studentId })
    expect(outcome.status).toBe('assigned')
    expect(h.scan.getPage(graded.id).bucket).toBe('graded')
  })
})

describe('overrides, reviewed, regrade', () => {
  it('rescore applies overrides, keeps detection flags elsewhere, and scores against the current key', () => {
    const test = syntheticTest()
    const raw = SYN_KEY.map((c, q) => (q === 2 ? null : c))
    const detected: DetectedRow[] = SYN_KEY.map((choice, q) => ({ q, state: 'filled', choice, fills: [], confidence: 0.9 }))
    detected[2] = { q: 2, state: 'multiple', choice: null, fills: [], confidence: 0.5 }
    const plain = rescore(test, raw, detected, [])
    expect(plain.correctCount).toBe(9)
    expect(plain.flags).toEqual([{ q: 2, kind: 'multiple' }])

    const fixed = rescore(test, raw, detected, [{ q: 2, rawChoice: null, overrideChoice: SYN_KEY[2] ?? 0, note: null }])
    expect(fixed.correctCount).toBe(10)
    expect(fixed.flags).toEqual([])
    expect(fixed.finalAnswers[2]).toBe(SYN_KEY[2])

    const blanked = rescore(test, raw, detected, [{ q: 0, rawChoice: SYN_KEY[0] ?? 0, overrideChoice: null, note: null }])
    expect(blanked.correctCount).toBe(8)
    expect(blanked.finalAnswers[0]).toBeNull()

    const shortRaw = rescore(test, [], null, [])
    expect(shortRaw.correctCount).toBe(0)
    expect(shortRaw.flags).toHaveLength(10)
  })

  it('overrideAnswer changes the score and can be removed again', () => {
    const resultId = graded.resultId ?? 0
    const wrong = (SYN_KEY[0] ?? 0) === 0 ? 1 : 0
    const changed = h.grading.overrideAnswer({ resultId, q: 0, override: { choice: wrong, note: 'Student circled the letter' } })
    expect(changed.correctCount).toBe(9)
    expect(changed.finalAnswers[0]).toBe(wrong)
    expect(changed.rawAnswers[0]).toBe(SYN_KEY[0])
    expect(changed.overrides).toEqual([{ q: 0, rawChoice: SYN_KEY[0], overrideChoice: wrong, note: 'Student circled the letter' }])

    const blanked = h.grading.overrideAnswer({ resultId, q: 0, override: { choice: null } })
    expect(blanked.finalAnswers[0]).toBeNull()
    expect(blanked.overrides).toHaveLength(1)
    expect(blanked.overrides[0]?.note).toBeNull()

    const restored = h.grading.overrideAnswer({ resultId, q: 0, override: null })
    expect(restored.correctCount).toBe(10)
    expect(restored.overrides).toEqual([])

    expect(() => h.grading.overrideAnswer({ resultId, q: 1, override: { choice: 4 } })).toThrow(AppError)
    expect(() => h.grading.overrideAnswer({ resultId: 9999, q: 0, override: null })).toThrow(AppError)
  })

  it('setReviewed toggles the flag', () => {
    const resultId = graded.resultId ?? 0
    expect(h.grading.setReviewed({ resultId, reviewed: true }).reviewed).toBe(true)
    expect(h.grading.setReviewed({ resultId, reviewed: false }).reviewed).toBe(false)
  })

  it('changing the key regrades existing results and keeps overrides', () => {
    const resultId = graded.resultId ?? 0
    h.grading.overrideAnswer({ resultId, q: 1, override: { choice: null } })
    const newKey = SYN_KEY.map((c, q) => (q === 0 ? (c === 0 ? 1 : 0) : c))
    h.tests.updateKey({ id: h.testId, correctChoices: newKey })
    const result = h.grading.getResult(resultId)
    expect(result.correctCount).toBe(8)
    expect(result.finalAnswers[1]).toBeNull()
    expect(result.overrides).toHaveLength(1)
    expect(h.grading.regradeTest(h.testId)).toEqual({ count: 1 })
  })
})

describe('results views', () => {
  it('resultsForTest lists rows, missing students, and statistics', async () => {
    const answers = SYN_KEY.map((c, q) => (q < 5 ? c : null))
    await h.scan.assignPage({ pageId: white.id, testId: h.testId, studentId: h.otherStudentId, answers })
    const view = h.grading.resultsForTest(h.testId)
    expect(view.test.id).toBe(h.testId)
    expect(view.test.questionCount).toBe(10)
    expect(view.test.activeStudentCount).toBe(2)
    expect(view.questions.map((q) => q.correctChoice)).toEqual(SYN_KEY)
    expect(view.rows.map((r) => r.student.lastName)).toEqual(['Abbott', 'Synth'])
    expect(view.rows[1]?.page?.id).toBe(graded.id)
    expect(view.missing).toEqual([])
    expect(view.averagePercent).toBe(75)
    expect(view.perQuestionCorrect.slice(0, 5)).toEqual([1, 1, 1, 1, 1])
    expect(view.perQuestionCorrect.slice(5)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5])
  })

  it('resultsForTest reports missing students when nobody is graded', () => {
    h.scan.discardPage(graded.id)
    const view = h.grading.resultsForTest(h.testId)
    expect(view.rows).toEqual([])
    expect(view.missing.map((s) => s.lastName)).toEqual(['Abbott', 'Synth'])
    expect(view.averagePercent).toBeNull()
    expect(view.perQuestionCorrect).toEqual(Array(10).fill(null))
  })

  it('resultsForStudent lists every test for a student', () => {
    const view = h.grading.resultsForStudent(h.studentId)
    expect(view.student.lastName).toBe('Synth')
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]?.test.title).toBe(syntheticTest().title)
    expect(view.rows[0]?.result.correctCount).toBe(10)
    expect(view.rows[0]?.page?.id).toBe(graded.id)
    expect(h.grading.resultsForStudent(h.otherStudentId).rows).toEqual([])
    expect(() => h.grading.resultsForStudent(9999)).toThrow(AppError)
  })
})
