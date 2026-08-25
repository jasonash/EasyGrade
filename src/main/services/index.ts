import type { Db } from '../db/database'
import { PrintRunRepository } from '../db/repositories/print-run.repo'
import { ResultRepository } from '../db/repositories/result.repo'
import { ScanRepository } from '../db/repositories/scan.repo'
import { SectionRepository } from '../db/repositories/section.repo'
import { SettingsRepository } from '../db/repositories/settings.repo'
import { StudentRepository } from '../db/repositories/student.repo'
import { TestRepository } from '../db/repositories/test.repo'
import { GradingService } from './grading.service'
import { PdfService } from './pdf.service'
import { ScanService, type ScanServiceOptions } from './scan.service'
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
  scan: ScanService
  grading: GradingService
  settings: SettingsService
}

export function createServices(db: Db, scanOptions: ScanServiceOptions): Services {
  const sectionRepo = new SectionRepository(db)
  const studentRepo = new StudentRepository(db)
  const testRepo = new TestRepository(db)
  const resultRepo = new ResultRepository(db)
  const scanRepo = new ScanRepository(db)
  const grading = new GradingService(resultRepo, testRepo, scanRepo, studentRepo)
  const tests = new TestService(testRepo, sectionRepo)
  tests.onKeyChange((testId) => grading.regradeTest(testId))
  return {
    sections: new SectionService(sectionRepo),
    students: new StudentService(studentRepo, sectionRepo),
    tests,
    print: new PrintService(testRepo, studentRepo, new PrintRunRepository(db), new PdfService()),
    scan: new ScanService(scanRepo, testRepo, studentRepo, resultRepo, grading, scanOptions),
    grading,
    settings: new SettingsService(new SettingsRepository(db))
  }
}
