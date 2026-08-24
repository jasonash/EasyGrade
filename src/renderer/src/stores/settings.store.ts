import { create } from 'zustand'
import type { Settings, SettingsPatch } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/schemas'
import { api, unwrap } from '@/api'

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: SettingsPatch) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await unwrap(api.settings.get())
    set({ settings, loaded: true })
  },
  update: async (patch) => {
    const settings = await unwrap(api.settings.set(patch))
    set({ settings })
  }
}))
