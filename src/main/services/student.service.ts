import type {
  ImportCommitInput,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewInput,
  Student,
  StudentInput,
  StudentMove,
  StudentUpdate
} from '@shared/types'
import {
  ImportCommitInputSchema,
  ImportPreviewInputSchema,
  StudentInputSchema,
  StudentMoveSchema,
  StudentUpdateSchema
} from '@shared/schemas'
import { classifyImportRows, parseRosterText, ROSTER_TEMPLATE_CSV } from '@shared/roster-import'
import type { StudentRepository } from '../db/repositories/student.repo'
import type { SectionRepository } from '../db/repositories/section.repo'
import { AppError } from './errors'

function normalizeNumber(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export class StudentService {
  constructor(
    private readonly repo: StudentRepository,
    private readonly sections: SectionRepository
  ) {}

  listBySection(sectionId: number, includeInactive = false): Student[] {
    this.requireSection(sectionId)
    return this.repo.listBySection(sectionId, includeInactive)
  }

  get(id: number): Student {
    const student = this.repo.findById(id)
    if (!student) throw new AppError('NOT_FOUND', `Student ${id} not found`)
    return student
  }

  create(input: StudentInput): Student {
    const parsed = StudentInputSchema.parse(input)
    this.requireSection(parsed.sectionId)
    return this.repo.insert({
      sectionId: parsed.sectionId,
      lastName: parsed.lastName,
      firstName: parsed.firstName,
      studentNumber: normalizeNumber(parsed.studentNumber)
    })
  }

  update(input: StudentUpdate): Student {
    const parsed = StudentUpdateSchema.parse(input)
    this.get(parsed.id)
    const updated = this.repo.update(parsed.id, {
      lastName: parsed.lastName,
      firstName: parsed.firstName,
      studentNumber: parsed.studentNumber === undefined ? undefined : normalizeNumber(parsed.studentNumber),
      active: parsed.active
    })
    if (!updated) throw new AppError('NOT_FOUND', `Student ${parsed.id} not found`)
    return updated
  }

  deactivate(id: number): Student {
    return this.update({ id, active: false })
  }

  reactivate(id: number): Student {
    return this.update({ id, active: true })
  }

  move(input: StudentMove): Student {
    const parsed = StudentMoveSchema.parse(input)
    const student = this.get(parsed.id)
    this.requireSection(parsed.sectionId)
    if (student.sectionId === parsed.sectionId) return student
    const moved = this.repo.update(parsed.id, { sectionId: parsed.sectionId })
    if (!moved) throw new AppError('NOT_FOUND', `Student ${parsed.id} not found`)
    return moved
  }

  /** Permanently remove a student who has no graded results. Otherwise deactivate instead. */
  remove(id: number): void {
    const student = this.get(id)
    if (student.resultCount > 0) {
      throw new AppError('CONFLICT', 'This student has graded results. Deactivate them instead of deleting.')
    }
    this.repo.delete(id)
  }

  importPreview(input: ImportPreviewInput): ImportPreview {
    const parsed = ImportPreviewInputSchema.parse(input)
    this.requireSection(parsed.sectionId)
    const result = parseRosterText(parsed.text)
    if (result.error) throw new AppError('VALIDATION', result.error)
    const existing = this.repo.listBySection(parsed.sectionId, true)
    const rows = classifyImportRows(result.rows, existing)
    const counts = { new: 0, duplicate: 0, error: 0 }
    for (const row of rows) counts[row.status]++
    return { rows, counts }
  }

  importCommit(input: ImportCommitInput): ImportCommitResult {
    const parsed = ImportCommitInputSchema.parse(input)
    this.requireSection(parsed.sectionId)
    if (parsed.rows.length === 0) return { created: 0 }
    const created = this.repo.insertMany(
      parsed.rows.map((row) => ({
        sectionId: parsed.sectionId,
        lastName: row.lastName,
        firstName: row.firstName,
        studentNumber: normalizeNumber(row.studentNumber)
      }))
    )
    return { created: created.length }
  }

  template(): string {
    return ROSTER_TEMPLATE_CSV
  }

  private requireSection(sectionId: number): void {
    if (!this.sections.findById(sectionId)) throw new AppError('NOT_FOUND', `Section ${sectionId} not found`)
  }
}
