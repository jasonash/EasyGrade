import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../src/main/services/errors'
import { scoreAnswers } from '../../src/main/services/grading.service'
import type { DetectedRow } from '../../src/shared/schemas'
import { SYN_KEY, SYN_OTHER_STUDENT, SYN_STUDENT_CODE, SYN_TEST_CODE, syntheticTest } from '../helpers/synthetic'
import { harness as makeHarness, loadSyntheticPages, makeRunner as makeRunnerFor, type Harness, type PagePlan, type SyntheticPages } from '../helpers/scan-harness'
import type { WorkerMessage } from '../../src/main/scan/worker-protocol'
import type { PipelineRunner } from '../../src/main/services/scan.service'

/**
 * ScanService with an in-process runner: the same pipeline the worker runs,
 * minus the thread. Covers persistence, grading, conflicts, progress, and
 * batch removal against a real (in-memory) database and a temp scans dir.
 */

let pages: SyntheticPages
let scansDir: string

beforeAll(async () => {
  pages = await loadSyntheticPages()
  scansDir = mkdtempSync(join(tmpdir(), 'easygrade-scans-'))
})

afterAll(() => {
  rmSync(scansDir, { recursive: true, force: true })
})

function makeRunner(plan: PagePlan, extra: WorkerMessage[] = []): PipelineRunner {
  return makeRunnerFor(pages, plan, extra)
}

function harness(runner: PipelineRunner): Harness {
  return makeHarness(runner, scansDir)
}

describe('ScanService', () => {
  let h: Harness

  beforeEach(() => {
    h = harness(makeRunner(['filled', 'filled-copy', 'blank-sheet', 'white'], [{ type: 'file-error', file: 'broken.pdf', message: 'cannot open' }]))
  })

  it('builds the scan context from finalized tests and every student', () => {
    const ctx = h.scan.buildContext()
    expect(Object.keys(ctx.tests)).toEqual([SYN_TEST_CODE])
    expect(ctx.tests[SYN_TEST_CODE]?.layoutVersion).toBe(1)
    expect(ctx.tests[SYN_TEST_CODE]?.layout.questionCount).toBe(10)
    expect(Object.keys(ctx.students).sort()).toEqual([SYN_STUDENT_CODE, SYN_OTHER_STUDENT, 'ZZZZZZ'].sort())
  })

  it('imports a batch, grades pages, flags the duplicate, and reports progress', async () => {
    const batch = await h.scan.importFiles(['/nowhere/synthetic.pdf', '/nowhere/broken.pdf'])
    expect(batch.status).toBe('complete')
    expect(batch.pageCount).toBe(4)
    expect(batch.counts).toEqual({ graded: 1, needs_assignment: 2, unreadable: 0, not_a_sheet: 1, discarded: 0 })
    expect(batch.errors).toEqual(['broken.pdf: cannot open'])
    expect(batch.sourceDescription).toBe('synthetic.pdf, broken.pdf')

    const pages = h.scan.listPages(batch.id)
    expect(pages.map((p) => p.bucket)).toEqual(['graded', 'needs_assignment', 'needs_assignment', 'not_a_sheet'])
    expect(pages.map((p) => p.reason)).toEqual([null, 'conflict', 'blank_sheet', null])

    const graded = pages[0]
    expect(graded?.resultId).not.toBeNull()
    expect(graded?.testId).toBe(h.testId)
    expect(graded?.studentId).toBe(h.studentId)
    expect(graded?.assignedBy).toBe('qr')
    expect(graded?.detected?.map((r) => r.choice)).toEqual(SYN_KEY)
    expect(graded?.qrPayload).toBe(`EG1:${SYN_TEST_CODE}:${SYN_STUDENT_CODE}:1`)
    const result = h.results.findByPair(h.testId, h.studentId)
    expect(result?.correctCount).toBe(10)
    expect(result?.possibleCount).toBe(10)
    expect(result?.scanPageId).toBe(graded?.id)
    expect(result?.flags).toEqual([])

    const duplicate = pages[1]
    expect(duplicate?.resultId).toBeNull()
    expect(duplicate?.studentId).toBe(h.studentId)
    expect(duplicate?.detected).not.toBeNull()

    const blankSheet = pages[2]
    expect(blankSheet?.studentId).toBeNull()
    expect(Object.keys(blankSheet?.crops ?? {})).toEqual(expect.arrayContaining(['name_box', 'section_box']))
    for (const page of pages) {
      expect(existsSync(join(scansDir, page.imagePath))).toBe(true)
      expect(existsSync(join(scansDir, page.thumbPath ?? ''))).toBe(true)
      for (const rel of Object.values(page.crops)) expect(existsSync(join(scansDir, rel))).toBe(true)
    }

    expect(h.progress[0]?.phase).toBe('starting')
    expect(h.progress.at(-1)?.phase).toBe('complete')
    expect(h.progress.at(-1)?.pagesDone).toBe(4)
    expect(h.progress.at(-1)?.pagesTotal).toBe(4)
    expect(h.progress.some((p) => p.message === 'broken.pdf: cannot open')).toBe(true)
    expect(h.scan.listBatches().map((b) => b.id)).toEqual([batch.id])
  })

  it('removes a batch with its files and results', async () => {
    const batch = await h.scan.importFiles(['/nowhere/synthetic.pdf'])
    const dir = join(scansDir, String(batch.id))
    expect(existsSync(dir)).toBe(true)
    await h.scan.removeBatch(batch.id)
    expect(existsSync(dir)).toBe(false)
    expect(h.scan.listBatches()).toEqual([])
    expect(h.results.findByPair(h.testId, h.studentId)).toBeNull()
    expect(() => h.scan.getBatch(batch.id)).toThrow(AppError)
  })

  it('rejects empty and unsupported imports before starting', async () => {
    await expect(h.scan.importFiles([])).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(h.scan.importFiles(['/nowhere/notes.docx'])).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(h.scan.listBatches()).toEqual([])
  })

  it('marks the batch as failed when the pipeline dies', async () => {
    const failing = harness(async (_job, handlers) => {
      await handlers.onMessage({ type: 'file', file: 'synthetic.pdf', pageCount: 3 })
      await handlers.onMessage({ type: 'fatal', message: 'worker crashed' })
    })
    await expect(failing.scan.importFiles(['/nowhere/synthetic.pdf'])).rejects.toThrow('worker crashed')
    const batch = failing.scan.listBatches()[0]
    expect(batch?.status).toBe('error')
    expect(batch?.errors).toEqual(['worker crashed'])
    expect(failing.progress.at(-1)?.phase).toBe('error')
  })
})

describe('scoreAnswers', () => {
  it('scores one point per correct filled row and flags the rest', () => {
    const answers: DetectedRow[] = SYN_KEY.map((choice, q) => ({ q, state: 'filled', choice, fills: [], confidence: 0.9 }))
    answers[1] = { q: 1, state: 'blank', choice: null, fills: [], confidence: 1 }
    answers[2] = { q: 2, state: 'multiple', choice: null, fills: [], confidence: 0.5 }
    answers[3] = { q: 3, state: 'filled', choice: (SYN_KEY[3] ?? 0) === 0 ? 1 : 0, fills: [], confidence: 0.2 }
    const score = scoreAnswers(syntheticTest(), answers)
    expect(score.possibleCount).toBe(10)
    expect(score.correctCount).toBe(7)
    expect(score.rawAnswers[1]).toBeNull()
    expect(score.rawAnswers[2]).toBeNull()
    expect(score.flags).toEqual([
      { q: 1, kind: 'blank' },
      { q: 2, kind: 'multiple' },
      { q: 3, kind: 'low_confidence' }
    ])
  })
})
