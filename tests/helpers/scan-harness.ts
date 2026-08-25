import { expect } from 'vitest'
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
import { GradingService } from '../../src/main/services/grading.service'
import { ScanService, type PipelineRunner } from '../../src/main/services/scan.service'
import { SectionService } from '../../src/main/services/section.service'
import { StudentService } from '../../src/main/services/student.service'
import { TestService } from '../../src/main/services/test.service'
import type { ScanProgress } from '../../src/shared/schemas'
import { generateCode } from '../../src/shared/codes'
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
  syntheticLayout
} from './synthetic'

/**
 * ScanService with an in-process runner: the same pipeline the worker runs,
 * minus the thread. Shared by the scan and grading service tests.
 */

export interface SyntheticPages {
  personalized: RasterPage
  blank: RasterPage
}

export async function loadSyntheticPages(): Promise<SyntheticPages> {
  const pages = await renderSyntheticPages()
  return { personalized: pages[0] as RasterPage, blank: pages[1] as RasterPage }
}

/** Pages the fake worker will "find" in the file, in order. */
export type PagePlan = ('filled' | 'filled-copy' | 'blank-sheet' | 'white')[]

export function makeRunner(pages: SyntheticPages, plan: PagePlan, extra: WorkerMessage[] = []): PipelineRunner {
  return async (job, handlers) => {
    await handlers.onMessage({ type: 'file', file: 'synthetic.pdf', pageCount: plan.length })
    for (const [i, kind] of plan.entries()) {
      let image = createGray(1700, 2200)
      if (kind === 'filled' || kind === 'filled-copy') {
        const page = { ...pages.personalized, image: cloneImage(pages.personalized.image) }
        SYN_KEY.forEach((choice, q) => fillBubble(page, syntheticLayout(), q, choice, 110))
        image = page.image
      } else if (kind === 'blank-sheet') {
        const page = { ...pages.blank, image: cloneImage(pages.blank.image) }
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

export interface Harness {
  db: Db
  scan: ScanService
  grading: GradingService
  tests: TestService
  students: StudentService
  results: ResultRepository
  scans: ScanRepository
  studentRepo: StudentRepository
  sectionId: number
  otherSectionId: number
  testId: number
  studentId: number
  /** Second student in the same section (no sheet printed for them). */
  otherStudentId: number
  progress: ScanProgress[]
}

export function harness(runner: PipelineRunner, scansDir: string): Harness {
  const db = openDatabase({ path: ':memory:' })
  const sectionRepo = new SectionRepository(db)
  const studentCodes = [SYN_STUDENT_CODE, SYN_OTHER_STUDENT]
  const studentRepo = new StudentRepository(db, () => studentCodes.shift() ?? generateCode())
  let testCodeUsed = false
  const testRepo = new TestRepository(db, () => {
    if (testCodeUsed) return generateCode()
    testCodeUsed = true
    return SYN_TEST_CODE
  })
  const resultRepo = new ResultRepository(db)
  const scanRepo = new ScanRepository(db)
  const sections = new SectionService(sectionRepo)
  const students = new StudentService(studentRepo, sectionRepo)
  const tests = new TestService(testRepo, sectionRepo)
  const grading = new GradingService(resultRepo, testRepo, scanRepo, studentRepo)
  tests.onKeyChange((id) => grading.regradeTest(id))
  const scan = new ScanService(scanRepo, testRepo, studentRepo, resultRepo, grading, { scansDir, runner })

  const sectionId = sections.create({ name: 'Synthetic Block', schoolYear: '2026-27' }).id
  const studentId = students.create({ sectionId, lastName: 'Synth', firstName: 'Sam', studentNumber: '424242' }).id
  const otherSectionId = sections.create({ name: 'Other', schoolYear: '2026-27' }).id
  students.create({ sectionId: otherSectionId, lastName: 'Else', firstName: 'Someone' })
  const otherStudentId = students.create({ sectionId, lastName: 'Abbott', firstName: 'Ada', studentNumber: '424243' }).id
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
  return {
    db,
    scan,
    grading,
    tests,
    students,
    results: resultRepo,
    scans: scanRepo,
    studentRepo,
    sectionId,
    otherSectionId,
    testId: finalized.id,
    studentId,
    otherStudentId,
    progress
  }
}
