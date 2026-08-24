import { z } from 'zod'

export const ThemeModeSchema = z.enum(['dark', 'light'])
export type ThemeMode = z.infer<typeof ThemeModeSchema>

/** All settings with their defaults. Stored as JSON values in the settings table. */
export const SettingsSchema = z.object({
  theme: ThemeModeSchema.default('dark'),
  scanRetentionDays: z.number().int().min(1).max(3650).default(180),
  defaultBlankCopies: z.number().int().min(0).max(50).default(2),
  lastExportDir: z.string().nullable().default(null),
  schoolYearFilter: z.string().nullable().default(null)
})

export type Settings = z.infer<typeof SettingsSchema>
export type SettingsKey = keyof Settings

export const SettingsPatchSchema = SettingsSchema.partial()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})
