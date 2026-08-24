import type { Section, SectionInput, SectionUpdate } from '@shared/types'
import { SectionInputSchema, SectionUpdateSchema } from '@shared/schemas'
import type { SectionRepository } from '../db/repositories/section.repo'
import { AppError } from './errors'

export class SectionService {
  constructor(private readonly repo: SectionRepository) {}

  list(includeArchived = false): Section[] {
    return this.repo.list(includeArchived)
  }

  get(id: number): Section {
    const section = this.repo.findById(id)
    if (!section) throw new AppError('NOT_FOUND', `Section ${id} not found`)
    return section
  }

  create(input: SectionInput): Section {
    const parsed = SectionInputSchema.parse(input)
    return this.repo.insert(parsed.name, parsed.schoolYear)
  }

  update(input: SectionUpdate): Section {
    const parsed = SectionUpdateSchema.parse(input)
    const updated = this.repo.update(parsed.id, {
      name: parsed.name,
      schoolYear: parsed.schoolYear,
      archived: parsed.archived
    })
    if (!updated) throw new AppError('NOT_FOUND', `Section ${parsed.id} not found`)
    return updated
  }

  remove(id: number): void {
    const section = this.get(id)
    if (section.studentCount > 0 || section.testCount > 0) {
      throw new AppError(
        'CONFLICT',
        'This section still has students or tests. Archive it instead, or remove them first.'
      )
    }
    this.repo.delete(id)
  }

  schoolYears(): string[] {
    return this.repo.schoolYears()
  }
}
