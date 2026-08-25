import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { BackupOutcome, BackupStatus, RestoreOutcome } from '@shared/schemas'
import type { Db } from '../db/database'
import { LATEST_SCHEMA_VERSION } from '../db/migrations'
import { AppError } from './errors'
import type { SettingsService } from './settings.service'

/**
 * Local backup snapshots (Decisions: "backup first, sync later"). A backup
 * folder holds:
 *
 *   easygrade-backup-<timestamp>.db   consistent snapshot via VACUUM INTO, newest N kept
 *   scans/                            mirror of userData/scans (missing files copied, purged files removed)
 *   manifest.json                     machine, time, schema version, counts (the seed of Option B sync)
 *
 * Everything is synchronous so it can run inside Electron's will-quit. The
 * folder may live on a cloud-synced drive: the live database never does.
 */

export interface BackupOptions {
  dbPath: string
  scansDir: string
  getDb: () => Db | null
  appVersion: string
  machineName: string
}

export interface MirrorStats {
  copied: number
  removed: number
}

const SNAPSHOT_PREFIX = 'easygrade-backup-'
const SNAPSHOT_SUFFIX = '.db'

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

/** Recursively list files under a directory as relative paths (forward slashes) with sizes. */
export function listFiles(root: string): Map<string, number> {
  const out = new Map<string, number>()
  if (!existsSync(root)) return out
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.set(relative(root, full).split(sep).join('/'), statSync(full).size)
    }
  }
  walk(root)
  return out
}

export function dirBytes(root: string): number {
  let total = 0
  for (const size of listFiles(root).values()) total += size
  return total
}

/** Make `target` contain exactly the files of `source` (by path and size). Returns what changed. */
export function mirrorDirectory(source: string, target: string, removeExtra: boolean): MirrorStats {
  const want = listFiles(source)
  const have = listFiles(target)
  let copied = 0
  let removed = 0
  for (const [rel, size] of want) {
    if (have.get(rel) === size) continue
    const dest = join(target, ...rel.split('/'))
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(source, ...rel.split('/')), dest)
    copied++
  }
  if (removeExtra) {
    for (const rel of have.keys()) {
      if (want.has(rel)) continue
      rmSync(join(target, ...rel.split('/')), { force: true })
      removed++
    }
    pruneEmptyDirs(target)
  }
  return { copied, removed }
}

function pruneEmptyDirs(root: string): void {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = join(root, entry.name)
    pruneEmptyDirs(full)
    if (readdirSync(full).length === 0) rmSync(full, { recursive: true, force: true })
  }
}

export class BackupService {
  constructor(
    private readonly settings: SettingsService,
    private readonly options: BackupOptions
  ) {}

  status(): BackupStatus {
    const dir = this.settings.get().backupDir
    const lastBackupAt = this.settings.get().lastBackupAt
    if (!dir) return { dir: null, dirOk: false, lastBackupAt, snapshots: [], scanBytes: null }
    const dirOk = existsSync(dir) && statSync(dir).isDirectory()
    const scansMirror = join(dir, 'scans')
    return {
      dir,
      dirOk,
      lastBackupAt,
      snapshots: dirOk ? this.listSnapshots(dir) : [],
      scanBytes: dirOk && existsSync(scansMirror) ? dirBytes(scansMirror) : null
    }
  }

  /** Newest first. */
  listSnapshots(dir: string): BackupStatus['snapshots'] {
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => name.startsWith(SNAPSHOT_PREFIX) && name.endsWith(SNAPSHOT_SUFFIX))
      .map((name) => {
        const path = join(dir, name)
        const st = statSync(path)
        return { path, createdAt: st.mtime.toISOString(), bytes: st.size }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Snapshot the database, mirror the scans, write the manifest, rotate old snapshots. */
  create(now = new Date()): BackupOutcome {
    const settings = this.settings.get()
    const dir = settings.backupDir
    if (!dir) throw new AppError('VALIDATION', 'Choose a backup folder first')
    const db = this.options.getDb()
    if (!db) throw new AppError('INTERNAL', 'The database is not open')
    mkdirSync(dir, { recursive: true })

    const snapshotPath = join(dir, `${SNAPSHOT_PREFIX}${stamp(now)}${SNAPSHOT_SUFFIX}`)
    const tempPath = `${snapshotPath}.part`
    rmSync(tempPath, { force: true })
    db.exec(`VACUUM INTO '${tempPath.replace(/'/g, "''")}'`)
    renameSync(tempPath, snapshotPath)
    const dbBytes = statSync(snapshotPath).size

    const mirror = mirrorDirectory(this.options.scansDir, join(dir, 'scans'), true)

    const counts = this.counts(db)
    const manifest = {
      app: 'EasyGrade',
      appVersion: this.options.appVersion,
      schemaVersion: LATEST_SCHEMA_VERSION,
      machineName: this.options.machineName,
      createdAt: now.toISOString(),
      snapshot: basename(snapshotPath),
      counts
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

    const snapshots = this.listSnapshots(dir)
    let snapshotsRemoved = 0
    for (const old of snapshots.slice(settings.backupKeep)) {
      rmSync(old.path, { force: true })
      snapshotsRemoved++
    }

    this.settings.set({ lastBackupAt: now.toISOString() })
    return { snapshotPath, createdAt: now.toISOString(), dbBytes, scanFilesCopied: mirror.copied, scanFilesRemoved: mirror.removed, snapshotsRemoved }
  }

  /** True when a backup is configured, wanted on quit, and the folder is reachable. */
  shouldBackupOnQuit(): boolean {
    const s = this.settings.get()
    return s.backupOnQuit && s.backupDir !== null && existsSync(s.backupDir)
  }

  /** A daily backup while the app stays open: due when the last one is older than 24 hours. */
  isDailyBackupDue(now = new Date()): boolean {
    const s = this.settings.get()
    if (!s.backupOnQuit || !s.backupDir || !existsSync(s.backupDir)) return false
    if (!s.lastBackupAt) return true
    return now.getTime() - new Date(s.lastBackupAt).getTime() >= 24 * 60 * 60 * 1000
  }

  /** Refuse anything that is not an EasyGrade database this build can open. */
  validateSnapshot(snapshotPath: string): void {
    if (!existsSync(snapshotPath)) throw new AppError('NOT_FOUND', 'Snapshot file not found')
    let probe: Database.Database | null = null
    try {
      probe = new Database(snapshotPath, { readonly: true, fileMustExist: true })
      const tables = probe.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
      const names = new Set(tables.map((t) => t.name))
      for (const required of ['schema_migrations', 'sections', 'students', 'tests', 'results']) {
        if (!names.has(required)) throw new AppError('VALIDATION', 'That file is not an EasyGrade backup')
      }
      const row = probe.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }
      if ((row.v ?? 0) > LATEST_SCHEMA_VERSION) {
        throw new AppError('VALIDATION', 'That backup was made by a newer version of EasyGrade. Update the app first.')
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError('VALIDATION', 'That file could not be read as a database')
    } finally {
      probe?.close()
    }
  }

  /**
   * Replace the live database with a snapshot and copy any scans the mirror
   * has that are missing locally. The caller must close the database first
   * and relaunch afterwards; the previous database is kept beside the new one.
   */
  restore(snapshotPath: string, now = new Date()): RestoreOutcome {
    this.validateSnapshot(snapshotPath)
    if (this.options.getDb()) throw new AppError('INTERNAL', 'Close the database before restoring')
    const { dbPath } = this.options
    if (existsSync(dbPath)) renameSync(dbPath, `${dbPath}.before-restore-${stamp(now)}`)
    rmSync(`${dbPath}-wal`, { force: true })
    rmSync(`${dbPath}-shm`, { force: true })
    mkdirSync(dirname(dbPath), { recursive: true })
    copyFileSync(snapshotPath, dbPath)

    const scansMirror = join(dirname(snapshotPath), 'scans')
    const scanFilesCopied = existsSync(scansMirror) ? mirrorDirectory(scansMirror, this.options.scansDir, false).copied : 0
    return { snapshotPath, scanFilesCopied }
  }

  private counts(db: Db): Record<string, number> {
    const count = (table: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
    return { sections: count('sections'), students: count('students'), tests: count('tests'), results: count('results'), scanPages: count('scan_pages') }
  }
}
