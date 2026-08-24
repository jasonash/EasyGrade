import type { Settings, SettingsPatch } from '@shared/types'
import { SettingsPatchSchema, SettingsSchema } from '@shared/schemas'
import type { SettingsRepository } from '../db/repositories/settings.repo'

export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  get(): Settings {
    // Unknown or invalid stored values fall back to defaults rather than failing.
    const stored = this.repo.getAll()
    const result = SettingsSchema.safeParse(stored)
    if (result.success) return result.data
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(stored)) {
      const single = SettingsSchema.safeParse({ [key]: value })
      if (single.success) cleaned[key] = value
    }
    return SettingsSchema.parse(cleaned)
  }

  set(patch: SettingsPatch): Settings {
    const parsed = SettingsPatchSchema.parse(patch)
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) this.repo.set(key, value)
    }
    return this.get()
  }
}
