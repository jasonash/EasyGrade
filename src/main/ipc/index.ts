import { app } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppInfo, SectionInput, SectionUpdate, SettingsPatch } from '@shared/types'
import type { Services } from '../services'
import { handle } from './handle'

export function registerIpcHandlers(services: Services): void {
  handle<[], AppInfo>(IPC.app.info, () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData')
  }))

  handle<[boolean | undefined], ReturnType<Services['sections']['list']>>(IPC.sections.list, (includeArchived) =>
    services.sections.list(includeArchived ?? false)
  )
  handle<[number], ReturnType<Services['sections']['get']>>(IPC.sections.get, (id) => services.sections.get(id))
  handle<[SectionInput], ReturnType<Services['sections']['create']>>(IPC.sections.create, (input) =>
    services.sections.create(input)
  )
  handle<[SectionUpdate], ReturnType<Services['sections']['update']>>(IPC.sections.update, (input) =>
    services.sections.update(input)
  )
  handle<[number], void>(IPC.sections.remove, (id) => services.sections.remove(id))
  handle<[], string[]>(IPC.sections.schoolYears, () => services.sections.schoolYears())

  handle<[], ReturnType<Services['settings']['get']>>(IPC.settings.get, () => services.settings.get())
  handle<[SettingsPatch], ReturnType<Services['settings']['set']>>(IPC.settings.set, (patch) =>
    services.settings.set(patch)
  )
}
