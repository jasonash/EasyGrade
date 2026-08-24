export type {
  Id,
  Section,
  SectionInput,
  SectionUpdate,
  Settings,
  SettingsKey,
  SettingsPatch,
  ThemeMode
} from '../schemas'

/** Every IPC call resolves to this envelope. Handlers never throw across the bridge. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  userDataPath: string
}
