import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Test, TestAttachment } from '@shared/types'
import type { TestRepository } from '../db/repositories/test.repo'
import { resizeToWidth } from '../scan/image'
import { encodePng } from '../scan/png'
import { rasterize } from '../scan/stages/rasterize'
import { AppError } from './errors'

/**
 * The teacher's own copy of a test (a PDF export of the Google Doc, or a
 * photo of the paper test) kept beside the answer sheet so it can be found
 * again years later. Files live in `<attachmentsDir>/<testId>/` with a
 * `thumb.png` of the first page; the test row holds the metadata.
 */

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024
export const ATTACHMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'] as const
export const ATTACHMENT_THUMB_NAME = 'thumb.png'
const THUMB_WIDTH = 300

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
}

/** Keep the original name recognizable but safe on every filesystem. */
export function storedFileName(original: string): string {
  const cleaned = original
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^[._]+|_+$/g, '')
    .trim()
  return cleaned === '' ? 'attachment' : cleaned.slice(0, 120)
}

export interface AttachmentServiceOptions {
  attachmentsDir: string
  maxBytes?: number
}

export class AttachmentService {
  constructor(
    private readonly repo: TestRepository,
    private readonly options: AttachmentServiceOptions
  ) {}

  folder(testId: number): string {
    return join(this.options.attachmentsDir, String(testId))
  }

  /** Copy a PDF or image in, make a thumbnail, and record it on the test. Replaces any earlier attachment. */
  attach(testId: number, sourcePath: string): Test {
    this.requireTest(testId)
    const ext = extname(sourcePath).toLowerCase()
    const mime = MIME_BY_EXT[ext]
    if (!mime) throw new AppError('VALIDATION', 'Attach a PDF, PNG, or JPEG file')
    if (!existsSync(sourcePath)) throw new AppError('NOT_FOUND', 'That file could not be found')
    const bytes = statSync(sourcePath).size
    const max = this.options.maxBytes ?? ATTACHMENT_MAX_BYTES
    if (bytes > max) throw new AppError('VALIDATION', `That file is larger than ${Math.round(max / 1024 / 1024)} MB`)

    const folder = this.folder(testId)
    rmSync(folder, { recursive: true, force: true })
    mkdirSync(folder, { recursive: true })
    const storedName = storedFileName(basename(sourcePath))
    copyFileSync(sourcePath, join(folder, storedName))

    let thumb: string | null = null
    try {
      const page = rasterize(readFileSync(sourcePath), mime, [0])[0]
      if (page) {
        writeFileSync(join(folder, ATTACHMENT_THUMB_NAME), encodePng(resizeToWidth(page.image, THUMB_WIDTH)))
        thumb = ATTACHMENT_THUMB_NAME
      }
    } catch {
      thumb = null
    }

    const attachment: TestAttachment = {
      fileName: basename(sourcePath),
      storedName,
      mime,
      bytes,
      addedAt: new Date().toISOString(),
      thumb
    }
    const updated = this.repo.update(testId, { attachmentJson: JSON.stringify(attachment) })
    if (!updated) throw new AppError('NOT_FOUND', `Test ${testId} not found`)
    return updated
  }

  remove(testId: number): Test {
    this.requireTest(testId)
    this.removeFolder(testId)
    const updated = this.repo.update(testId, { attachmentJson: null })
    if (!updated) throw new AppError('NOT_FOUND', `Test ${testId} not found`)
    return updated
  }

  /** Absolute path of the stored file, for opening in the system viewer. */
  filePath(testId: number): string {
    const test = this.requireTest(testId)
    if (!test.attachment) throw new AppError('NOT_FOUND', 'This test has no attached file')
    const path = join(this.folder(testId), test.attachment.storedName)
    if (!existsSync(path)) throw new AppError('NOT_FOUND', 'The attached file is missing from disk')
    return path
  }

  /** Give a copied test its own copy of the source's file. Called by TestService.copy. */
  copy(fromTestId: number, toTestId: number): void {
    const source = this.repo.findById(fromTestId)
    if (!source?.attachment) return
    const from = this.folder(fromTestId)
    if (!existsSync(from)) return
    cpSync(from, this.folder(toTestId), { recursive: true })
    this.repo.update(toTestId, { attachmentJson: JSON.stringify(source.attachment) })
  }

  /** Delete the folder without touching the row (the row is going away). */
  removeFolder(testId: number): void {
    rmSync(this.folder(testId), { recursive: true, force: true })
  }

  private requireTest(testId: number): Test {
    const test = this.repo.findById(testId)
    if (!test) throw new AppError('NOT_FOUND', `Test ${testId} not found`)
    return test
  }
}
