/**
 * Read models for Phase 7 housekeeping: CSV export, backup and restore,
 * and the retention purge. Plain interfaces; inputs are ids or nothing.
 */

export interface ExportOutcome {
  path: string
  /** Data rows written (header excluded). */
  rows: number
}

export interface PurgePreview {
  retentionDays: number
  /** Batches imported before this ISO timestamp qualify. */
  cutoff: string
  batchCount: number
  pageCount: number
  /** Bytes the page images of those batches occupy on disk. */
  bytes: number
}

export interface PurgeOutcome {
  batchCount: number
  pageCount: number
  bytes: number
}

export interface BackupSnapshot {
  path: string
  createdAt: string
  bytes: number
}

export interface BackupStatus {
  dir: string | null
  /** True when the folder exists and can be written. */
  dirOk: boolean
  lastBackupAt: string | null
  snapshots: BackupSnapshot[]
  /** Size of the mirrored scans folder in the backup location, when present. */
  scanBytes: number | null
}

export interface BackupOutcome {
  snapshotPath: string
  createdAt: string
  dbBytes: number
  scanFilesCopied: number
  scanFilesRemoved: number
  snapshotsRemoved: number
}

export interface RestoreOutcome {
  snapshotPath: string
  scanFilesCopied: number
}
