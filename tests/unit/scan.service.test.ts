import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { ResultRepository } from '../../src/main/db/repositories/result.repo'
import { ScanRepository } from '../../src/main/db/repositories/scan.repo'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { StudentRepository } from '../../src/main/db/repositories/student.repo'
import { TestRepository } from '../../src/main/db/repositories/test.repo'
import { createGray } from '../../src/main/scan/image'
import { processPage } from '../../src/main/scan/pipeline'
import { encodePng } from '../../src/main/scan/png'
import type { RasterPage } from '../../src/main/scan/stages/rasterize'
import type { WorkerMessage } from '../../src/main/scan/worker-protocol'
import { AppError } from '../../src/main/services/errors'
import { GradingService, scoreAnswers } from '../../src/main/services/grading.service'
import { ScanService, type PipelineRunner } from '../../src/main/services/scan.service'
import { SectionService } from '../../src/main/services/section.service'
import { StudentService } from '../../src/main/services/student.service'
import { TestService } from '../../src/main/services/test.service'
import type { DetectedRow, ScanProgress } from '../../src/shared/schemas'
import { CLEAN_TEST, fixtureChoices } from '../fixtures/calibration'
import {
  SYN_KEY,
  SYN_OTHER_STUDENT,
  SYN_STUDENT_CODE,
  SYN_TEST_CODE,
  cloneImage,
  fillBubble,
  renderSyntheticPages,
  scribbleName,
  syntheticLayout,
  syntheticTest
} from '../helpers/synthetic'

/**
 * ScanService with an in-process runner: the same pipeline the worker runs,
 * minus the thread. Covers persistence, grading, conflicts, progress, and
 * batch removal against a real (in-memory) database and a temp scans dir.
 */

let personalized: RasterPage
let blank: RasterPage
let scansDir: string

beforeAll(async () => {
  const pages = await renderSyntheticPages()
  personalized = pages[0] as RasterPage
  blank = pages[1] as RasterPage
  scansDir = mkdtempSync(join(tmpdir(), 'easygrade-scans-'))
})

afterAll(() => {
  rmSync(scansDir, { recursive: true, force: true })
})

interface Harness {
  db: Db
  scan: ScanService
  results: ResultRepository
  scans: ScanRepository
  testId: number
  studentId: number
  progress: ScanProgress[]
}

/** Pages the fake worker will "find" in the file, in order. */
type PagePlan = ('filled' | 'filled-copy' | 'blank-sheet' | 'white')[]

function makeRunner(plan: PagePlan, extra: WorkerMessage[] = []): PipelineRunner {
  return async (job, handlers) => {
    await handlers.onMessage({ type: 'file', file: 'synthetic.pdf', pageCount: plan.length })
    for (const [i, kind] of plan.entries()) {
      let image = createGray(1700, 2200)
      if (kind === 'filled' || kind === 'filled-copy') {
        const page = { ...personalized, image: cloneImage(personalized.image) }
        SYN_KEY.forEach((choice, q) => fillBubble(page, syntheticLayout(), q, choice, 110))
        image = page.image
      } else if (kind === 'blank-sheet') {
        const page = { ...blank, image: cloneImage(blank.image) }
        scribbleName(page)
        SYN_KEY.forEach((choice, q) => fillBubble(page, syntheticLayout(), q, choice, 110))
        image = page.image
      }
      const out = await processPage({ pageIndex: i, image }, job.ctx)
      const crops: Record<string, Uint8Array> = {}
      for (const [name, img] of Object.entries(out.crops)) crops[name] = encodePng(img)
      await handlers.onMessage({
        type: 'page',
        file: 'synthetic.pdf',
        fileIndex: i,
        result: out.result,
        image: encodePng(out.canonical ?? out.thumbnail),
        thumbnail: encodePng(out.thumbnail),
        crops
      })
    }
    for (const m of extra) await handlers.onMessage(m)
    await handlers.onMessage({ type: 'done' })
  }
}

function harness(runner: PipelineRunner): Harness {
  const db = openDatabase({ path: ':memory:' })
  const sectionRepo = new SectionRepository(db)
  const studentCodes = [SYN_STUDENT_CODE, SYN_OTHER_STUDENT]
  const studentRepo = new StudentRepository(db, () => studentCodes.shift() ?? 'ZZZZZZ')
  const testRepo = new TestRepository(db, () => SYN_TEST_CODE)
  const resultRepo = new ResultRepository(db)
  const scanRepo = new ScanRepository(db)
  const sections = new SectionService(sectionRepo)
  const students = new StudentService(studentRepo, sectionRepo)
  const tests = new TestService(testRepo, sectionRepo)
  const grading = new GradingService(resultRepo, testRepo)
  const scan = new ScanService(scanRepo, testRepo, studentRepo, resultRepo, grading, { scansDir, runner })

  const sectionId = sections.create({ name: 'Synthetic Block', schoolYear: '2026-27' }).id
  const studentId = students.create({ sectionId, lastName: 'Synth', firstName: 'Sam', studentNumber: '424242' }).id
  students.create({ sectionId: sections.create({ name: 'Other', schoolYear: '2026-27' }).id, lastName: 'Else', firstName: 'Someone' })
  const draft = tests.create({ sectionId, title: CLEAN_TEST.title })
  tests.update({
    id: draft.id,
    title: CLEAN_TEST.title,
    instructions: CLEAN_TEST.instructions,
    questions: CLEAN_TEST.questions.map((q) => ({ stem: q.stem, choices: fixtureChoices(q.choiceCount), correctChoice: q.key }))
  })
  const finalized = tests.finalize(draft.id)
  expect(finalized.code).toBe(SYN_TEST_CODE)

  const progress: ScanProgress[] = []
  scan.onProgress((p) => progress.push(p))
  return { db, scan, results: resultRepo, scans: scanRepo, testId: finalized.id, studentId, progress }
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
    expect(Object.keys(ctx.students).sort()).toEqual([SYN_STUDENT_CODE, SYN_OTHER_STUDENT].sort())
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
