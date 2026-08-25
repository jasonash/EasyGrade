import type { Db } from '../db/database'
import { PrintRunRepository } from '../db/repositories/print-run.repo'
import { SectionRepository } from '../db/repositories/section.repo'
import { SettingsRepository } from '../db/repositories/settings.repo'
import { StudentRepository } from '../db/repositories/student.repo'
import { TestRepository } from '../db/repositories/test.repo'
import { PdfService } from './pdf.service'
import { PrintService } from './print.service'
import { SectionService } from './section.service'
import { SettingsService } from './settings.service'
import { StudentService } from './student.service'
import { TestService } from './test.service'

export interface Services {
  sections: SectionService
  students: StudentService
  tests: TestService
  print: PrintService
  settings: SettingsService
}

export function createServices(db: Db): Services {
  const sectionRepo = new SectionRepository(db)
  const studentRepo = new StudentRepository(db)
  const testRepo = new TestRepository(db)
  return {
    sections: new SectionService(sectionRepo),
    students: new StudentService(studentRepo, sectionRepo),
    tests: new TestService(testRepo, sectionRepo),
    print: new PrintService(testRepo, studentRepo, new PrintRunRepository(db), new PdfService()),
    settings: new SettingsService(new SettingsRepository(db))
  }
}
