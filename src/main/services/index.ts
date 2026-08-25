import type { Db } from '../db/database'
import { SectionRepository } from '../db/repositories/section.repo'
import { SettingsRepository } from '../db/repositories/settings.repo'
import { StudentRepository } from '../db/repositories/student.repo'
import { SectionService } from './section.service'
import { SettingsService } from './settings.service'
import { StudentService } from './student.service'

export interface Services {
  sections: SectionService
  students: StudentService
  settings: SettingsService
}

export function createServices(db: Db): Services {
  const sectionRepo = new SectionRepository(db)
  return {
    sections: new SectionService(sectionRepo),
    students: new StudentService(new StudentRepository(db), sectionRepo),
    settings: new SettingsService(new SettingsRepository(db))
  }
}
