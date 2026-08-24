import type {
  ApiResult,
  AppInfo,
  Section,
  SectionInput,
  SectionUpdate,
  Settings,
  SettingsPatch
} from './types'

/**
 * The full contract between renderer and main. The preload exposes exactly
 * this shape as `window.easygrade`; main registers one handler per method.
 */
export interface EasyGradeApi {
  app: {
    info: () => Promise<ApiResult<AppInfo>>
  }
  sections: {
    list: (includeArchived?: boolean) => Promise<ApiResult<Section[]>>
    get: (id: number) => Promise<ApiResult<Section>>
    create: (input: SectionInput) => Promise<ApiResult<Section>>
    update: (input: SectionUpdate) => Promise<ApiResult<Section>>
    remove: (id: number) => Promise<ApiResult<void>>
    schoolYears: () => Promise<ApiResult<string[]>>
  }
  settings: {
    get: () => Promise<ApiResult<Settings>>
    set: (patch: SettingsPatch) => Promise<ApiResult<Settings>>
  }
}

/** Channel names, derived so preload and main cannot drift. */
export const IPC = {
  app: { info: 'app:info' },
  sections: {
    list: 'sections:list',
    get: 'sections:get',
    create: 'sections:create',
    update: 'sections:update',
    remove: 'sections:remove',
    schoolYears: 'sections:schoolYears'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  }
} as const
