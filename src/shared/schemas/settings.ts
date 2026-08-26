import { z } from 'zod'

export const ThemeModeSchema = z.enum(['dark', 'light'])
export type ThemeMode = z.infer<typeof ThemeModeSchema>

export const TextSizeSchema = z.enum(['normal', 'large', 'larger'])
export type TextSize = z.infer<typeof TextSizeSchema>

/** Top-level pages the app reopens on launch. Settings is deliberately not one of them. */
export const LastPageSchema = z.enum(['sections', 'tests', 'grading'])
export type LastPage = z.infer<typeof LastPageSchema>

/** Window zoom factor for each text size; applied through the preload. */
export const TEXT_SIZE_ZOOM: Record<TextSize, number> = { normal: 1, large: 1.15, larger: 1.3 }

/**
 * Setting fields without defaults. Defaults live in DEFAULT_SETTINGS and are
 * merged in by SettingsSchema, so a patch never carries defaults for keys it
 * did not mention (Zod 4's `.partial()` would otherwise fill them in and a
 * one-key update would reset everything else).
 */
const fields = {
  theme: ThemeModeSchema,
  textSize: TextSizeSchema,
  scanRetentionDays: z.number().int().min(1).max(3650),
  defaultBlankCopies: z.number().int().min(0).max(50),
  lastExportDir: z.string().nullable(),
  schoolYearFilter: z.string().nullable(),
  /** Folder that receives database snapshots and the scans mirror. Null = backups off. */
  backupDir: z.string().nullable(),
  backupOnQuit: z.boolean(),
  /** Database snapshots to keep in the backup folder. */
  backupKeep: z.number().int().min(1).max(50),
  lastBackupAt: z.string().nullable(),
  /** The rail page that was open when the app last closed. Null = Sections. */
  lastPage: LastPageSchema.nullable()
}

const FullSettingsSchema = z.object(fields)
export type Settings = z.infer<typeof FullSettingsSchema>
export type SettingsKey = keyof Settings

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  textSize: 'normal',
  scanRetentionDays: 180,
  defaultBlankCopies: 2,
  lastExportDir: null,
  schoolYearFilter: null,
  backupDir: null,
  backupOnQuit: true,
  backupKeep: 10,
  lastBackupAt: null,
  lastPage: null
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
