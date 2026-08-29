import type { Db } from '../db/database'
import { PrintRunRepository } from '../db/repositories/print-run.repo'
import { ResultRepository } from '../db/repositories/result.repo'
import { ScanRepository } from '../db/repositories/scan.repo'
import { SectionRepository } from '../db/repositories/section.repo'
import { SettingsRepository } from '../db/repositories/settings.repo'
import { StudentRepository } from '../db/repositories/student.repo'
import { TestRepository } from '../db/repositories/test.repo'
import { AttachmentService } from './attachment.service'
import { BackupService, type BackupOptions } from './backup.service'
import { ExportService } from './export.service'
import { GradingService } from './grading.service'
import { RetentionService } from './retention.service'
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
  attachments: AttachmentService
  print: PrintService
  scan: ScanService
  grading: GradingService
  exports: ExportService
  retention: RetentionService
  backup: BackupService
  settings: SettingsService
}

export function createServices(db: Db, scanOptions: ScanServiceOptions, backupOptions: BackupOptions): Services {
  const sectionRepo = new SectionRepository(db)
  const studentRepo = new StudentRepository(db)
  const testRepo = new TestRepository(db)
  const resultRepo = new ResultRepository(db)
  const scanRepo = new ScanRepository(db)
  const grading = new GradingService(resultRepo, testRepo, scanRepo, studentRepo)
  const attachments = new AttachmentService(testRepo, { attachmentsDir: backupOptions.attachmentsDir })
  const tests = new TestService(testRepo, sectionRepo, attachments)
  tests.onKeyChange((testId) => grading.regradeTest(testId))
  const settings = new SettingsService(new SettingsRepository(db))
  return {
    sections: new SectionService(sectionRepo),
    students: new StudentService(studentRepo, sectionRepo),
    tests,
    attachments,
    print: new PrintService(testRepo, studentRepo, new PrintRunRepository(db), new PdfService()),
    scan: new ScanService(scanRepo, testRepo, studentRepo, resultRepo, grading, scanOptions),
    grading,
    exports: new ExportService(grading, testRepo, studentRepo, sectionRepo),
    retention: new RetentionService(scanRepo, settings, scanOptions.scansDir),
    backup: new BackupService(settings, backupOptions),
    settings
  }
}
