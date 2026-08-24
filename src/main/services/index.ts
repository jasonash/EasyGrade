import type { Db } from '../db/database'
import { SectionRepository } from '../db/repositories/section.repo'
import { SettingsRepository } from '../db/repositories/settings.repo'
import { SectionService } from './section.service'
import { SettingsService } from './settings.service'

export interface Services {
  sections: SectionService
  settings: SettingsService
}

export function createServices(db: Db): Services {
  return {
    sections: new SectionService(new SectionRepository(db)),
    settings: new SettingsService(new SettingsRepository(db))
  }
}
