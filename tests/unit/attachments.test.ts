import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { TestRepository } from '../../src/main/db/repositories/test.repo'
import { decodePng, encodePng } from '../../src/main/scan/png'
import { createGray } from '../../src/main/scan/image'
import { ATTACHMENT_THUMB_NAME, AttachmentService, storedFileName } from '../../src/main/services/attachment.service'
import { AppError } from '../../src/main/services/errors'
import { PdfService } from '../../src/main/services/pdf.service'
import { SectionService } from '../../src/main/services/section.service'
import { TestService } from '../../src/main/services/test.service'
import { syntheticStudent, syntheticTest } from '../helpers/synthetic'
import type { SheetLayout } from '../../src/shared/layout'

describe('AttachmentService', () => {
  let root: string
  let db: Db
  let tests: TestService
  let attachments: AttachmentService
  let sectionId: number
  let pdfPath: string
  let pngPath: string

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'easygrade-attach-'))
    const test = syntheticTest()
    const pdf = await new PdfService().render({ test, layout: test.layout as SheetLayout, students: [syntheticStudent()], blankCount: 0, dateLabel: null })
    pdfPath = join(root, 'Unit 3 Exam: final?.pdf')
    writeFileSync(pdfPath, pdf.buffer)
    pngPath = join(root, 'photo.PNG')
    writeFileSync(pngPath, encodePng(createGray(400, 600, 200)))
  })

  beforeEach(() => {
    db = openDatabase({ path: ':memory:' })
    const sectionRepo = new SectionRepository(db)
    const repo = new TestRepository(db)
    attachments = new AttachmentService(repo, { attachmentsDir: join(root, 'attachments'), maxBytes: 2 * 1024 * 1024 })
    tests = new TestService(repo, sectionRepo, attachments)
    sectionId = new SectionService(sectionRepo).create({ name: 'Bio', schoolYear: '2026-27' }).id
  })

  afterEach(() => {
    rmSync(join(root, 'attachments'), { recursive: true, force: true })
  })

  function sheet(): number {
    return tests.create({ sectionId, title: 'Exam', kind: 'answer_sheet', questionCount: 3 }).id
  }

  it('keeps file names recognizable but safe', () => {
    expect(storedFileName('Unit 3 Exam: final?.pdf')).toBe('Unit_3_Exam__final_.pdf')
    expect(storedFileName('.hidden')).toBe('hidden')
    expect(storedFileName('///')).toBe('attachment')
  })

  it('copies a PDF in, makes a first-page thumbnail, and records it on the test', () => {
    const id = sheet()
    const test = attachments.attach(id, pdfPath)
    expect(test.attachment).toMatchObject({
      fileName: 'Unit 3 Exam: final?.pdf',
      storedName: 'Unit_3_Exam__final_.pdf',
      mime: 'application/pdf',
      bytes: statSync(pdfPath).size,
      thumb: ATTACHMENT_THUMB_NAME
    })
    const folder = attachments.folder(id)
    expect(readdirSync(folder).sort()).toEqual([ATTACHMENT_THUMB_NAME, 'Unit_3_Exam__final_.pdf'].sort())
    const thumb = decodePng(readFileSync(join(folder, ATTACHMENT_THUMB_NAME)))
    expect(thumb.width).toBe(300)
    expect(thumb.height).toBeGreaterThan(300)
    expect(attachments.filePath(id)).toBe(join(folder, 'Unit_3_Exam__final_.pdf'))
    expect(tests.get(id).attachment?.fileName).toBe('Unit 3 Exam: final?.pdf')
  })

  it('replaces an earlier file, accepts images, and removes cleanly', () => {
    const id = sheet()
    attachments.attach(id, pdfPath)
    const replaced = attachments.attach(id, pngPath)
    expect(replaced.attachment?.mime).toBe('image/png')
    expect(readdirSync(attachments.folder(id)).sort()).toEqual([ATTACHMENT_THUMB_NAME, 'photo.PNG'].sort())
    const removed = attachments.remove(id)
    expect(removed.attachment).toBeNull()
    expect(existsSync(attachments.folder(id))).toBe(false)
    expect(() => attachments.filePath(id)).toThrow(AppError)
  })

  it('refuses other file types, missing files, and oversized files', () => {
    const id = sheet()
    const docx = join(root, 'test.docx')
    writeFileSync(docx, 'x')
    expect(() => attachments.attach(id, docx)).toThrow(/PDF, PNG, or JPEG/)
    expect(() => attachments.attach(id, join(root, 'missing.pdf'))).toThrow(/could not be found/)
    const big = join(root, 'big.pdf')
    writeFileSync(big, Buffer.alloc(3 * 1024 * 1024))
    expect(() => attachments.attach(id, big)).toThrow(/larger than 2 MB/)
    expect(tests.get(id).attachment).toBeNull()
    expect(() => attachments.attach(999, pdfPath)).toThrow(/not found/)
  })

  it('follows the test through copy and delete', () => {
    const id = sheet()
    attachments.attach(id, pdfPath)
    const copy = tests.copy({ id, sectionId })
    expect(copy.attachment?.fileName).toBe('Unit 3 Exam: final?.pdf')
    expect(readdirSync(attachments.folder(copy.id)).sort()).toEqual([ATTACHMENT_THUMB_NAME, 'Unit_3_Exam__final_.pdf'].sort())
    // Independent copies: removing one leaves the other.
    attachments.remove(copy.id)
    expect(existsSync(attachments.folder(id))).toBe(true)
    tests.remove(id)
    expect(existsSync(attachments.folder(id))).toBe(false)
    expect(db.prepare('SELECT COUNT(*) AS n FROM tests').get()).toEqual({ n: 1 })
  })
})
