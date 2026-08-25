import { z } from 'zod'

export const ThemeModeSchema = z.enum(['dark', 'light'])
export type ThemeMode = z.infer<typeof ThemeModeSchema>

/**
 * Setting fields without defaults. Defaults live in DEFAULT_SETTINGS and are
 * merged in by SettingsSchema, so a patch never carries defaults for keys it
 * did not mention (Zod 4's `.partial()` would otherwise fill them in and a
 * one-key update would reset everything else).
 */
const fields = {
  theme: ThemeModeSchema,
  scanRetentionDays: z.number().int().min(1).max(3650),
  defaultBlankCopies: z.number().int().min(0).max(50),
  lastExportDir: z.string().nullable(),
  schoolYearFilter: z.string().nullable(),
  /** Folder that receives database snapshots and the scans mirror. Null = backups off. */
  backupDir: z.string().nullable(),
  backupOnQuit: z.boolean(),
  /** Database snapshots to keep in the backup folder. */
  backupKeep: z.number().int().min(1).max(50),
  lastBackupAt: z.string().nullable()
}

const FullSettingsSchema = z.object(fields)
export type Settings = z.infer<typeof FullSettingsSchema>
export type SettingsKey = keyof Settings

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  scanRetentionDays: 180,
  defaultBlankCopies: 2,
  lastExportDir: null,
  schoolYearFilter: null,
  backupDir: null,
  backupOnQuit: true,
  backupKeep: 10,
  lastBackupAt: null
}

/** Only the keys given; undefined keys are absent, not defaulted. */
export const SettingsPatchSchema = FullSettingsSchema.partial()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

/** Stored values (possibly incomplete) to a complete Settings object. */
export const SettingsSchema = SettingsPatchSchema.transform((partial): Settings => {
  const out: Settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(fields) as SettingsKey[]) {
    const value = partial[key]
    if (value !== undefined) (out as Record<string, unknown>)[key] = value
  }
  return out
})
