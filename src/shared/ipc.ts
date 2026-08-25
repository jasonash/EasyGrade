import type {
  ApiResult,
  AppInfo,
  ImportCommitInput,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewInput,
  PickedTextFile,
  PrintOutcome,
  PrintRequest,
  PrintRun,
  AssignOutcome,
  AssignPageInput,
  BackupOutcome,
  BackupStatus,
  ExportOutcome,
  PurgeOutcome,
  PurgePreview,
  RestoreOutcome,
  ResetOutcome,
  UpdateState,
  GradeResult,
  OverrideAnswerInput,
  RegradeOutcome,
  ResolveConflictInput,
  ScanBatch,
  ScanPageDetail,
  ScanProgress,
  SetReviewedInput,
  StudentResults,
  TestResults,
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
    /** Put text on the system clipboard via the main process (works even when the page lacks focus). */
    copyText: (text: string) => Promise<ApiResult<void>>
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
  print: {
    /** Generate to a temp file and open it in the system PDF viewer. No print run is recorded. */
    preview: (input: PrintRequest) => Promise<ApiResult<PrintOutcome>>
    /** Generate, ask where to save, write the file, and record the print run. Null when cancelled. */
    savePdf: (input: PrintRequest) => Promise<ApiResult<PrintOutcome | null>>
    /** Generate to a temp file, record the print run, and hand the PDF to the system viewer for printing. */
    printPdf: (input: PrintRequest) => Promise<ApiResult<PrintOutcome>>
    listRuns: (testId: number) => Promise<ApiResult<PrintRun[]>>
  }
  scan: {
    /** Open a multi-select file picker for PDFs and images. Resolves null when cancelled. */
    pickFiles: () => Promise<ApiResult<string[] | null>>
    /** Import and grade the files as one batch. Resolves when every page has been processed. */
    importFiles: (paths: string[]) => Promise<ApiResult<ScanBatch>>
    listBatches: () => Promise<ApiResult<ScanBatch[]>>
    getBatch: (batchId: number) => Promise<ApiResult<ScanBatch>>
    listPages: (batchId: number) => Promise<ApiResult<ScanPageDetail[]>>
    getPage: (pageId: number) => Promise<ApiResult<ScanPageDetail>>
    /** Delete a batch, its pages, its images, and results that came from it. */
    removeBatch: (batchId: number) => Promise<ApiResult<void>>
    /** Attach a page to a test and student and grade it. Reports a conflict instead of replacing unless asked. */
    assignPage: (input: AssignPageInput) => Promise<ApiResult<AssignOutcome>>
    /** Keep the existing result (discard this page) or replace it with this page. */
    resolveConflict: (input: ResolveConflictInput) => Promise<ApiResult<ScanPageDetail>>
    /** Move a page to the discarded bucket, deleting its result if it had one. */
    discardPage: (pageId: number) => Promise<ApiResult<ScanPageDetail>>
    /** What "Purge now" would remove under the current retention setting. */
    purgePreview: () => Promise<ApiResult<PurgePreview>>
    /** Delete page images of batches older than the retention setting. Results are kept. */
    purge: () => Promise<ApiResult<PurgeOutcome>>
    /** Subscribe to progress events; returns an unsubscribe function. */
    onProgress: (listener: (progress: ScanProgress) => void) => () => void
  }
  grading: {
    resultsForTest: (testId: number) => Promise<ApiResult<TestResults>>
    resultsForStudent: (studentId: number) => Promise<ApiResult<StudentResults>>
    getResult: (resultId: number) => Promise<ApiResult<GradeResult>>
    overrideAnswer: (input: OverrideAnswerInput) => Promise<ApiResult<GradeResult>>
    setReviewed: (input: SetReviewedInput) => Promise<ApiResult<GradeResult>>
    /** Rescore every result of a test against its current key and overrides. */
    regradeTest: (testId: number) => Promise<ApiResult<RegradeOutcome>>
  }
  export: {
    /** Save a test's results as CSV via a save dialog. Null when cancelled. */
    testCsv: (testId: number) => Promise<ApiResult<ExportOutcome | null>>
    /** Save a section's grade summary (one column per finalized test) as CSV. Null when cancelled. */
    sectionCsv: (sectionId: number) => Promise<ApiResult<ExportOutcome | null>>
  }
  backup: {
    /** Pick the backup folder; stores it in settings. Null when cancelled. */
    chooseDir: () => Promise<ApiResult<string | null>>
    status: () => Promise<ApiResult<BackupStatus>>
    /** Snapshot the database and mirror the scans into the backup folder now. */
    create: () => Promise<ApiResult<BackupOutcome>>
    /** Pick a snapshot and replace the local data with it in place. Null when cancelled. The renderer reloads afterwards. */
    restore: () => Promise<ApiResult<RestoreOutcome | null>>
    /** Start over: keep the current database beside a fresh empty one, delete all scan images. The renderer reloads afterwards. */
    reset: () => Promise<ApiResult<ResetOutcome>>
  }
  settings: {
    get: () => Promise<ApiResult<Settings>>
    set: (patch: SettingsPatch) => Promise<ApiResult<Settings>>
  }
  update: {
    getState: () => Promise<ApiResult<UpdateState>>
    /** Ask GitHub Releases for a newer version; resolves once the check settles. */
    check: () => Promise<ApiResult<UpdateState>>
    download: () => Promise<ApiResult<UpdateState>>
    /** Quit and install a downloaded update. */
    install: () => Promise<ApiResult<void>>
    /** Subscribe to update state changes; returns an unsubscribe function. */
    onStatus: (listener: (state: UpdateState) => void) => () => void
  }
}

/** Channel names, derived so preload and main cannot drift. */
export const IPC = {
  app: { info: 'app:info', copyText: 'app:copyText' },
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
  print: {
    preview: 'print:preview',
    savePdf: 'print:savePdf',
    printPdf: 'print:printPdf',
    listRuns: 'print:listRuns'
  },
  scan: {
    pickFiles: 'scan:pickFiles',
    importFiles: 'scan:importFiles',
    listBatches: 'scan:listBatches',
    getBatch: 'scan:getBatch',
    listPages: 'scan:listPages',
    getPage: 'scan:getPage',
    removeBatch: 'scan:removeBatch',
    assignPage: 'scan:assignPage',
    resolveConflict: 'scan:resolveConflict',
    discardPage: 'scan:discardPage',
    purgePreview: 'scan:purgePreview',
    purge: 'scan:purge',
    /** Event channel (main to renderer), not an invoke. */
    progress: 'scan:progress'
  },
  grading: {
    resultsForTest: 'grading:resultsForTest',
    resultsForStudent: 'grading:resultsForStudent',
    getResult: 'grading:getResult',
    overrideAnswer: 'grading:overrideAnswer',
    setReviewed: 'grading:setReviewed',
    regradeTest: 'grading:regradeTest'
  },
  export: {
    testCsv: 'export:testCsv',
    sectionCsv: 'export:sectionCsv'
  },
  backup: {
    chooseDir: 'backup:chooseDir',
    status: 'backup:status',
    create: 'backup:create',
    restore: 'backup:restore',
    reset: 'backup:reset'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  },
  update: {
    getState: 'update:getState',
    check: 'update:check',
    download: 'update:download',
    install: 'update:install',
    /** Event channel (main to renderer), not an invoke. */
    status: 'update:status'
  }
} as const
