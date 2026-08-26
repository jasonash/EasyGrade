import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type {
  AssignOutcome,
  AssignPageInput,
  BucketCounts,
  DetectedRow,
  PageBucket,
  PageReason,
  ResolveConflictInput,
  ScanBatch,
  ScanContext,
  ScanPageDetail,
  ScanProgress
} from '@shared/schemas'
import { AssignPageInputSchema, EMPTY_COUNTS, ResolveConflictInputSchema } from '@shared/schemas'
import type { Test } from '@shared/types'
import { parseQrPayload } from '@shared/codes'
import type { ScanRepository } from '../db/repositories/scan.repo'
import type { StudentRepository } from '../db/repositories/student.repo'
import type { TestRepository } from '../db/repositories/test.repo'
import type { ResultRepository } from '../db/repositories/result.repo'
import type { ScanJob, WorkerMessage } from '../scan/worker-protocol'
import { decodePng, encodePng } from '../scan/png'
import { makeCrops } from '../scan/stages/crops'
import { classifyRows, pageReferences, sampleFills } from '../scan/stages/omr'
import { SUPPORTED_SCAN_EXTENSIONS, mimeForFile } from '../scan/stages/rasterize'
import { AppError } from './errors'
import type { GradingService } from './grading.service'

/**
 * Imports scans (ARCHITECTURE 8). The pipeline runs in a worker thread; this
 * service owns the batch and page rows, the files under the scans directory,
 * grading of pages that come back "graded", and progress reporting.
 *
 * `runner` is how the job reaches the pipeline. The default spawns the
 * bundled worker; tests inject an in-process runner.
 */

export type ProgressListener = (progress: ScanProgress) => void

export interface RunnerHandlers {
  onMessage: (message: WorkerMessage) => Promise<void> | void
}

export type PipelineRunner = (job: ScanJob, handlers: RunnerHandlers) => Promise<void>

export interface ScanServiceOptions {
  /** Absolute directory holding batch folders (userData/scans). */
  scansDir: string
  runner?: PipelineRunner
  /** Absolute path of the bundled worker script (dist/main/scan-worker.js). */
  workerPath?: string
}

export class ScanService {
  private readonly runner: PipelineRunner
  private readonly listeners = new Set<ProgressListener>()
  private importing = false

  constructor(
    private readonly scans: ScanRepository,
    private readonly tests: TestRepository,
    private readonly students: StudentRepository,
    private readonly results: ResultRepository,
    private readonly grading: GradingService,
    private readonly options: ScanServiceOptions
  ) {
    this.runner = options.runner ?? ((job, handlers) => runInWorker(this.workerPath(), job, handlers))
  }

  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  listBatches(): ScanBatch[] {
    return this.scans.listBatches()
  }

  getBatch(id: number): ScanBatch {
    const batch = this.scans.getBatch(id)
    if (!batch) throw new AppError('NOT_FOUND', 'Batch not found')
    return batch
  }

  listPages(batchId: number): ScanPageDetail[] {
    this.getBatch(batchId)
    return this.scans.listPages(batchId).map((page) => this.attachResult(page))
  }

  getPage(pageId: number): ScanPageDetail {
    const page = this.scans.getPage(pageId)
    if (!page) throw new AppError('NOT_FOUND', 'Page not found')
    return this.attachResult(page)
  }

  private attachResult(page: ScanPageDetail): ScanPageDetail {
    const result = page.resultId !== null ? this.results.findById(page.resultId) : null
    return { ...page, result }
  }

  /**
   * Teacher assignment: attach a page to a test and student and grade it.
   * Answers come from, in order, the teacher's manual entry, the detection
   * already on the page (same test), or a fresh read of the stored canonical
   * image with the chosen test's layout. A page whose marks were never found
   * has no canonical image, so it needs manual answers.
   */
  async assignPage(input: AssignPageInput): Promise<AssignOutcome> {
    const parsed = AssignPageInputSchema.parse(input)
    const page = this.getPage(parsed.pageId)
    const test = this.tests.findById(parsed.testId)
    if (!test) throw new AppError('NOT_FOUND', 'Test not found')
    if (test.status !== 'finalized' || !test.layout) throw new AppError('VALIDATION', 'Only finalized tests can be graded')
    const student = this.students.findById(parsed.studentId)
    if (!student) throw new AppError('NOT_FOUND', 'Student not found')

    const current = page.resultId !== null ? this.results.findById(page.resultId) : null
    if (current && current.testId === test.id && current.studentId === student.id && !parsed.answers) {
      return { status: 'assigned', page }
    }

    const other = this.results.findByPair(test.id, student.id)
    if (other && other.id !== current?.id) {
      if (!parsed.replace) {
        const existingPage = other.scanPageId !== null ? this.scans.getPage(other.scanPageId) : null
        return { status: 'conflict', existing: other, existingPage: existingPage ? this.attachResult(existingPage) : null }
      }
      this.results.delete(other.id)
      if (other.scanPageId !== null && other.scanPageId !== page.id) {
        this.scans.updatePage(other.scanPageId, { bucket: 'discarded', reason: 'conflict', resultId: null })
      }
    }

    let rawAnswers: (number | null)[] | null = null
    let detected: DetectedRow[] | null = null
    let crops: Record<string, string> | undefined
    if (parsed.answers) {
      rawAnswers = validateManualAnswers(test, parsed.answers)
    } else if (page.detected && page.testId === test.id && page.detected.length === test.questions.length) {
      detected = page.detected
    } else {
      const fresh = await this.detectWithLayout(page, test)
      if (!fresh) {
        throw new AppError('VALIDATION', 'The bubbles on this page could not be read. Enter the answers by hand to grade it.')
      }
      detected = fresh.detected
      crops = fresh.crops
    }

    if (current) this.results.delete(current.id)
    const qrVersion = page.qrPayload ? parseQrPayload(page.qrPayload)?.layoutVersion : undefined
    const record = {
      testId: test.id,
      studentId: student.id,
      scanPageId: page.id,
      layoutVersion: qrVersion ?? test.layoutVersion,
      needsLook: page.alignmentQuality === 'weak' || (qrVersion !== undefined && qrVersion !== test.layoutVersion)
    }
    const outcome = detected
      ? this.grading.recordFromScan({ ...record, answers: detected })
      : this.grading.recordManual({ ...record, rawAnswers: rawAnswers ?? [] })
    if (outcome.conflict || !outcome.result) throw new AppError('CONFLICT', 'A result already exists for this student')

    this.scans.updatePage(page.id, {
      testId: test.id,
      studentId: student.id,
      assignedBy: 'teacher',
      bucket: 'graded',
      reason: null,
      resultId: outcome.result.id,
      detected,
      ...(crops ? { crops } : {})
    })
    return { status: 'assigned', page: this.getPage(page.id) }
  }

  /** A page whose (test, student) pair already had a result when it was scanned. */
  async resolveConflict(input: ResolveConflictInput): Promise<ScanPageDetail> {
    const parsed = ResolveConflictInputSchema.parse(input)
    const page = this.getPage(parsed.pageId)
    if (page.reason !== 'conflict' || page.testId === null || page.studentId === null) {
      throw new AppError('VALIDATION', 'This page is not a conflict')
    }
    if (parsed.action === 'keep') return this.discardPage(page.id)
    const outcome = await this.assignPage({ pageId: page.id, testId: page.testId, studentId: page.studentId, replace: true })
    if (outcome.status !== 'assigned') throw new AppError('INTERNAL', 'Replace did not complete')
    return outcome.page
  }

  /** Move a page out of every working bucket. A graded page loses its result. */
  discardPage(pageId: number): ScanPageDetail {
    const page = this.getPage(pageId)
    if (page.resultId !== null) this.results.delete(page.resultId)
    this.scans.updatePage(page.id, { bucket: 'discarded', resultId: null })
    return this.getPage(page.id)
  }

  /** Re-read the bubbles of an aligned page with a specific test's layout, regenerating the row crops. */
  private async detectWithLayout(page: ScanPageDetail, test: Test): Promise<{ detected: DetectedRow[]; crops: Record<string, string> } | null> {
    if (!test.layout) return null
    if (page.alignmentQuality !== 'good' && page.alignmentQuality !== 'weak') return null
    let canonical
    try {
      canonical = decodePng(await readFile(this.imagePath(page.imagePath)))
    } catch {
      return null
    }
    const refs = pageReferences(canonical)
    if (!refs.usable) return null
    const detected = classifyRows(sampleFills(canonical, test.layout, refs))

    const stem = basename(page.imagePath, '.png')
    const dir = join(this.options.scansDir, String(page.batchId))
    const crops: Record<string, string> = {}
    for (const [name, rel] of Object.entries(page.crops)) {
      if (!name.startsWith('row_')) crops[name] = rel
    }
    for (const [name, img] of Object.entries(makeCrops(canonical, test.layout, detected, false))) {
      await writeFile(join(dir, `${stem}.${name}.png`), encodePng(img))
      crops[name] = join(String(page.batchId), `${stem}.${name}.png`)
    }
    return { detected, crops }
  }

  /** Everything a QR can refer to right now. */
  buildContext(): ScanContext {
    const ctx: ScanContext = { tests: {}, students: {} }
    for (const test of this.tests.listFinalized()) {
      if (!test.layout) continue
      ctx.tests[test.code] = { id: test.id, sectionId: test.sectionId, layoutVersion: test.layoutVersion, layout: test.layout }
    }
    for (const student of this.students.listAll()) {
      ctx.students[student.code] = { id: student.id, sectionId: student.sectionId }
    }
    return ctx
  }

  async importFiles(paths: string[]): Promise<ScanBatch> {
    if (paths.length === 0) throw new AppError('VALIDATION', 'Choose at least one PDF or image file')
    const unsupported = paths.filter((p) => !mimeForFile(p))
    if (unsupported.length > 0) {
      throw new AppError(
        'VALIDATION',
        `Unsupported file type: ${basename(unsupported[0] ?? '')}. Use ${SUPPORTED_SCAN_EXTENSIONS.join(', ')}.`
      )
    }
    if (this.importing) throw new AppError('CONFLICT', 'An import is already running')
    this.importing = true
    try {
      return await this.runImport(paths)
    } finally {
      this.importing = false
    }
  }

  private async runImport(paths: string[]): Promise<ScanBatch> {
    const names = paths.map((p) => basename(p))
    const batch = this.scans.insertBatch(names.join(', '))
    const dir = join(this.options.scansDir, String(batch.id))
    await mkdir(dir, { recursive: true })

    const counts: BucketCounts = { ...EMPTY_COUNTS }
    const errors: string[] = []
    let pagesTotal = 0
    let pagesDone = 0
    let currentFile: string | null = null
    const notify = (phase: ScanProgress['phase'], message: string | null = null): void => {
      const progress: ScanProgress = { batchId: batch.id, phase, pagesTotal, pagesDone, currentFile, counts: { ...counts }, message }
      for (const listener of this.listeners) listener(progress)
    }
    notify('starting')

    const job: ScanJob = { files: paths.map((p) => ({ path: p, name: basename(p) })), ctx: this.buildContext() }
    try {
      await this.runner(job, {
        onMessage: async (message) => {
          switch (message.type) {
            case 'file':
              pagesTotal += message.pageCount
              currentFile = message.file
              this.scans.updateBatch(batch.id, { pageCount: pagesTotal })
              notify('processing')
              break
            case 'file-error':
              errors.push(`${message.file}: ${message.message}`)
              this.scans.updateBatch(batch.id, { errors })
              notify('processing', `${message.file}: ${message.message}`)
              break
            case 'page': {
              const bucket = await this.persistPage(batch.id, dir, pagesDone, message)
              counts[bucket] += 1
              pagesDone += 1
              currentFile = message.file
              notify('processing')
              break
            }
            case 'fatal':
              throw new AppError('INTERNAL', message.message)
            case 'done':
              break
          }
        }
      })
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      errors.push(text)
      this.scans.updateBatch(batch.id, { status: 'error', completedAt: new Date().toISOString(), errors, pageCount: pagesDone })
      notify('error', text)
      throw err
    }

    const status = pagesDone === 0 && errors.length > 0 ? 'error' : 'complete'
    this.scans.updateBatch(batch.id, { status, completedAt: new Date().toISOString(), errors, pageCount: pagesDone })
    notify('complete')
    return this.getBatch(batch.id)
  }

  private async persistPage(batchId: number, dir: string, pageIndex: number, message: Extract<WorkerMessage, { type: 'page' }>): Promise<PageBucket> {
    const stem = `page-${String(pageIndex).padStart(3, '0')}`
    const rel = (name: string): string => join(String(batchId), name)
    await writeFile(join(dir, `${stem}.png`), message.image)
    await writeFile(join(dir, `${stem}.thumb.png`), message.thumbnail)
    const crops: Record<string, string> = {}
    for (const [name, png] of Object.entries(message.crops)) {
      await writeFile(join(dir, `${stem}.${name}.png`), png)
      crops[name] = rel(`${stem}.${name}.png`)
    }

    const r = message.result
    const page = this.scans.insertPage({
      batchId,
      pageIndex,
      imagePath: rel(`${stem}.png`),
      thumbPath: rel(`${stem}.thumb.png`),
      status: 'processed',
      bucket: r.bucket,
      reason: r.reason,
      rotation: r.rotation,
      alignmentQuality: r.alignment.quality,
      alignmentResidual: r.alignment.residual,
      qrPayload: r.qr?.raw ?? null,
      testId: r.testId,
      studentId: r.studentId ?? (r.qr?.payload.studentCode ? this.students.findByCode(r.qr.payload.studentCode)?.id ?? null : null),
      assignedBy: r.qr ? 'qr' : null,
      detected: r.answers,
      crops
    })

    if (r.bucket !== 'graded' || r.testId === null || r.studentId === null || !r.answers) return r.bucket
    const outcome = this.grading.recordFromScan({
      testId: r.testId,
      studentId: r.studentId,
      scanPageId: page.id,
      layoutVersion: r.qr?.payload.layoutVersion ?? 1,
      answers: r.answers,
      needsLook: r.flags.includes('weak_alignment') || r.flags.includes('stale_layout')
    })
    if (outcome.conflict) {
      const reason: PageReason = 'conflict'
      this.scans.setOutcome(page.id, { bucket: 'needs_assignment', reason, resultId: null })
      return 'needs_assignment'
    }
    this.scans.setOutcome(page.id, { bucket: 'graded', reason: null, resultId: outcome.result?.id ?? null })
    return 'graded'
  }

  async removeBatch(batchId: number): Promise<void> {
    this.getBatch(batchId)
    this.results.deleteByBatch(batchId)
    this.scans.deleteBatch(batchId)
    await rm(join(this.options.scansDir, String(batchId)), { recursive: true, force: true })
  }

  /** Absolute path for a stored page image or crop. */
  imagePath(relative: string): string {
    return join(this.options.scansDir, relative)
  }

  private workerPath(): string {
    if (this.options.workerPath) return this.options.workerPath
    throw new AppError('INTERNAL', 'Scan worker path is not configured')
  }
}

function validateManualAnswers(test: Test, answers: (number | null)[]): (number | null)[] {
  if (answers.length !== test.questions.length) {
    throw new AppError('VALIDATION', `Enter one answer per question (${test.questions.length})`)
  }
  answers.forEach((choice, q) => {
    const question = test.questions[q]
    if (choice !== null && (!question || choice >= question.choices.length)) {
      throw new AppError('VALIDATION', `Question ${q + 1} has no choice ${choice + 1}`)
    }
  })
  return answers
}

function runInWorker(workerPath: string, job: ScanJob, handlers: RunnerHandlers): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath)
    let chain: Promise<void> = Promise.resolve()
    let finished = false
    const finish = (err?: unknown): void => {
      if (finished) return
      finished = true
      void worker.terminate()
      if (err) reject(err instanceof Error ? err : new Error(String(err)))
      else resolve()
    }
    worker.on('message', (message: WorkerMessage) => {
      chain = chain
        .then(() => handlers.onMessage(message))
        .then(() => {
          if (message.type === 'done') finish()
        })
        .catch((err: unknown) => finish(err))
    })
    worker.on('error', (err) => finish(err))
    worker.on('exit', (code) => {
      if (!finished) void chain.then(() => finish(code === 0 ? undefined : new Error(`Scan worker exited with code ${code}`)))
    })
    worker.postMessage(job)
  })
}
