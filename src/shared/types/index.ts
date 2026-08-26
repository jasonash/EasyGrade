export type {
  Id,
  ImportCommitInput,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewInput,
  ImportRow,
  ImportRowStatus,
  PrintOutcome,
  PrintRequest,
  PrintRun,
  BucketCounts,
  PageBucket,
  PageReason,
  PageFlag,
  DetectedRow,
  QuestionFlag,
  ScanBatch,
  ScanPage,
  ScanPageDetail,
  ScanProgress,
  GradeResult,
  AnswerOverride,
  AssignPageInput,
  AssignOutcome,
  ConflictAction,
  ResolveConflictInput,
  OverrideAnswerInput,
  SetReviewedInput,
  ResultRow,
  ResultsQuestion,
  TestResults,
  StudentResultRow,
  StudentResults,
  RegradeOutcome,
  ExportOutcome,
  PurgePreview,
  PurgeOutcome,
  BackupSnapshot,
  BackupStatus,
  BackupOutcome,
  RestoreOutcome,
  ResetOutcome,
  UpdateState,
  UpdateStatus,
  UpdateDisabledReason,
  Section,
  SectionInput,
  SectionUpdate,
  Settings,
  SettingsKey,
  SettingsPatch,
  Student,
  StudentInput,
  StudentMove,
  StudentUpdate,
  Test,
  TestCopyInput,
  TestCreateInput,
  TestKeyUpdate,
  TestStatus,
  TestSummary,
  TestUpdateInput,
  DraftQuestion,
  StoredQuestion,
  TextSize,
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

/** A text file the user picked in an open dialog. */
export interface PickedTextFile {
  name: string
  text: string
}
