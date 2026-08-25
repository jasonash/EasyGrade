import type {
  ApiResult,
  AppInfo,
  ImportCommitInput,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewInput,
  PickedTextFile,
  Section,
  SectionInput,
  SectionUpdate,
  Settings,
  SettingsPatch,
  Student,
  StudentInput,
  StudentMove,
  StudentUpdate,
  Test,
  TestCopyInput,
  TestCreateInput,
  TestKeyUpdate,
  TestSummary,
  TestUpdateInput
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
  students: {
    listBySection: (sectionId: number, includeInactive?: boolean) => Promise<ApiResult<Student[]>>
    get: (id: number) => Promise<ApiResult<Student>>
    create: (input: StudentInput) => Promise<ApiResult<Student>>
    update: (input: StudentUpdate) => Promise<ApiResult<Student>>
    move: (input: StudentMove) => Promise<ApiResult<Student>>
    deactivate: (id: number) => Promise<ApiResult<Student>>
    reactivate: (id: number) => Promise<ApiResult<Student>>
    remove: (id: number) => Promise<ApiResult<void>>
    importPreview: (input: ImportPreviewInput) => Promise<ApiResult<ImportPreview>>
    importCommit: (input: ImportCommitInput) => Promise<ApiResult<ImportCommitResult>>
    /** Open a file picker for a CSV/TSV/TXT roster. Resolves null when cancelled. */
    pickImportFile: () => Promise<ApiResult<PickedTextFile | null>>
    /** Save the CSV template via a save dialog. Resolves the saved path, or null when cancelled. */
    saveTemplate: () => Promise<ApiResult<string | null>>
  }
  tests: {
    /** All tests, or only one section's. */
    list: (sectionId?: number) => Promise<ApiResult<TestSummary[]>>
    get: (id: number) => Promise<ApiResult<Test>>
    create: (input: TestCreateInput) => Promise<ApiResult<Test>>
    /** Draft text edits. Refused for finalized tests. */
    update: (input: TestUpdateInput) => Promise<ApiResult<Test>>
    /** Answer key only; allowed at any status. */
    updateKey: (input: TestKeyUpdate) => Promise<ApiResult<Test>>
    finalize: (id: number) => Promise<ApiResult<Test>>
    unlock: (id: number) => Promise<ApiResult<Test>>
    copy: (input: TestCopyInput) => Promise<ApiResult<Test>>
    remove: (id: number) => Promise<ApiResult<void>>
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
  students: {
    listBySection: 'students:listBySection',
    get: 'students:get',
    create: 'students:create',
    update: 'students:update',
    move: 'students:move',
    deactivate: 'students:deactivate',
    reactivate: 'students:reactivate',
    remove: 'students:remove',
    importPreview: 'students:importPreview',
    importCommit: 'students:importCommit',
    pickImportFile: 'students:pickImportFile',
    saveTemplate: 'students:saveTemplate'
  },
  tests: {
    list: 'tests:list',
    get: 'tests:get',
    create: 'tests:create',
    update: 'tests:update',
    updateKey: 'tests:updateKey',
    finalize: 'tests:finalize',
    unlock: 'tests:unlock',
    copy: 'tests:copy',
    remove: 'tests:remove'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  }
} as const
