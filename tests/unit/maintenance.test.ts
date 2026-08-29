import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { DataStore } from '../../src/main/data-store'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { SettingsRepository } from '../../src/main/db/repositories/settings.repo'
import { StudentRepository } from '../../src/main/db/repositories/student.repo'
import { TestRepository } from '../../src/main/db/repositories/test.repo'
import { BackupService, listFiles, mirrorDirectory } from '../../src/main/services/backup.service'
import { AppError } from '../../src/main/services/errors'
import { ExportService } from '../../src/main/services/export.service'
import { RetentionService } from '../../src/main/services/retention.service'
import { SettingsService } from '../../src/main/services/settings.service'
import { SYN_KEY } from '../helpers/synthetic'
import { harness, loadSyntheticPages, makeRunner, type Harness, type SyntheticPages } from '../helpers/scan-harness'

/**
 * Phase 7 housekeeping: CSV exports, retention purge, and backup/restore,
 * all against a real in-memory database plus temp folders on disk.
 */

let pages: SyntheticPages
let scansDir: string
let h: Harness
let settings: SettingsService

function parseCsv(text: string): string[][] {
  return text
    .replace(/^﻿/, '')
    .trimEnd()
    .split('\r\n')
    .map((line) => line.split(','))
}

beforeAll(async () => {
  pages = await loadSyntheticPages()
})

afterAll(() => {
  rmSync(scansDir, { recursive: true, force: true })
})

beforeEach(async () => {
  if (scansDir) rmSync(scansDir, { recursive: true, force: true })
  if (scansDir) rmSync(`${scansDir}-attachments`, { recursive: true, force: true })
  scansDir = mkdtempSync(join(tmpdir(), 'easygrade-maint-'))
  h = harness(makeRunner(pages, ['filled', 'blank-sheet', 'white']), scansDir)
  settings = new SettingsService(new SettingsRepository(h.db))
  const batch = await h.scan.importFiles(['/nowhere/synthetic.pdf'])
  const list = h.scan.listPages(batch.id)
  // Blank sheet -> Abbott, so the section has two graded students.
  await h.scan.assignPage({ pageId: list[1]?.id ?? 0, testId: h.testId, studentId: h.otherStudentId })
})

describe('ExportService', () => {
  function exporter(): ExportService {
    return new ExportService(h.grading, new TestRepository(h.db), new StudentRepository(h.db), new SectionRepository(h.db))
  }

  it('exports test results with one row per student, per-question letters, and the key', () => {
    h.grading.overrideAnswer({ resultId: h.results.findByPair(h.testId, h.studentId)?.id ?? 0, q: 0, override: { choice: null } })
    h.students.create({ sectionId: h.sectionId, lastName: 'Zed', firstName: 'Missing' })
    const out = exporter().testCsv(h.testId)
    expect(out.fileName).toBe('fixture-a-clean-marks-results.csv')
    const rows = parseCsv(out.csv)
    expect(rows[0]?.slice(0, 7)).toEqual(['Last name', 'First name', 'Student number', 'Status', 'Correct', 'Possible', 'Percent'])
    expect(rows[0]?.slice(7, 17)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'])
    expect(rows[1]?.slice(0, 7)).toEqual(['Abbott', 'Ada', '424243', 'graded', '10', '10', '100'])
    expect(rows[2]?.slice(0, 7)).toEqual(['Synth', 'Sam', '424242', 'graded', '9', '10', '90'])
    expect(rows[2]?.[7]).toBe('')
    expect(rows[2]?.[17]).toBe('')
    expect(rows[3]?.slice(0, 4)).toEqual(['Zed', 'Missing', '', 'missing'])
    const keyRow = rows.at(-1)
    expect(keyRow?.[0]).toBe('Answer key')
    expect(keyRow?.slice(7, 17)).toEqual(SYN_KEY.map((c) => 'ABCDE'[c]))
    expect(out.rows).toBe(4)
  })

  it('adds Points and Out of columns when the test is worth something', () => {
    new TestRepository(h.db).update(h.testId, { totalPoints: 50 })
    h.grading.overrideAnswer({ resultId: h.results.findByPair(h.testId, h.studentId)?.id ?? 0, q: 0, override: { choice: null } })
    h.students.create({ sectionId: h.sectionId, lastName: 'Zed', firstName: 'Missing' })
    const rows = parseCsv(exporter().testCsv(h.testId).csv)
    expect(rows[0]?.slice(4, 10)).toEqual(['Correct', 'Possible', 'Percent', 'Points', 'Out of', 'Q1'])
    expect(rows[1]?.slice(4, 9)).toEqual(['10', '10', '100', '50', '50'])
    expect(rows[2]?.slice(4, 9)).toEqual(['9', '10', '90', '45', '50'])
    expect(rows[3]?.slice(3, 9)).toEqual(['missing', '', '', '', '', '50'])
    expect(rows.at(-1)?.[0]).toBe('Answer key')
    expect(rows.at(-1)?.slice(9, 19)).toEqual(SYN_KEY.map((c) => 'ABCDE'[c]))
  })

  it('exports a section summary with a percent column per finalized test and an average', () => {
    h.tests.create({ sectionId: h.sectionId, title: 'Draft only' })
    const out = exporter().sectionCsv(h.sectionId)
    expect(out.fileName).toBe('synthetic-block-grades.csv')
    const rows = parseCsv(out.csv)
    expect(rows[0]).toEqual(['Last name', 'First name', 'Student number', 'Fixture A: Clean marks', 'Average'])
    expect(rows[1]).toEqual(['Abbott', 'Ada', '424243', '100', '100'])
    expect(rows[2]).toEqual(['Synth', 'Sam', '424242', '100', '100'])
    expect(rows).toHaveLength(3)
    expect(() => exporter().sectionCsv(9999)).toThrow(AppError)
  })
})

describe('RetentionService', () => {
  it('previews and purges only batches older than the retention window', async () => {
    const retention = new RetentionService(h.scans, settings, scansDir)
    expect(retention.preview().batchCount).toBe(0)

    // Backdate the batch past the default 180 days.
    h.db.prepare('UPDATE scan_batches SET imported_at = ?').run(new Date(Date.now() - 200 * 86400000).toISOString())
    const preview = retention.preview()
    expect(preview.retentionDays).toBe(180)
    expect(preview.batchCount).toBe(1)
    expect(preview.pageCount).toBe(3)
    expect(preview.bytes).toBeGreaterThan(10000)

    const batchId = h.scan.listBatches()[0]?.id ?? 0
    const outcome = retention.purge()
    expect(outcome).toEqual({ batchCount: 1, pageCount: 3, bytes: preview.bytes })
    expect(existsSync(join(scansDir, String(batchId)))).toBe(false)
    const batch = h.scan.getBatch(batchId)
    expect(batch.purgedAt).not.toBeNull()
    expect(batch.counts.graded).toBe(2)
    for (const page of h.scan.listPages(batchId)) {
      expect(page.imagePath).toBe('')
      expect(page.thumbPath).toBeNull()
      expect(page.crops).toEqual({})
    }
    expect(h.results.listByTest(h.testId)).toHaveLength(2)
    expect(retention.preview().batchCount).toBe(0)
    expect(retention.purge().batchCount).toBe(0)
  })

  it('honours a shorter retention setting', () => {
    settings.set({ scanRetentionDays: 1 })
    h.db.prepare('UPDATE scan_batches SET imported_at = ?').run(new Date(Date.now() - 2 * 86400000).toISOString())
    expect(new RetentionService(h.scans, settings, scansDir).preview().batchCount).toBe(1)
  })
})

describe('mirrorDirectory', () => {
  it('copies missing or changed files and optionally removes extras', () => {
    const root = mkdtempSync(join(tmpdir(), 'easygrade-mirror-'))
    const src = join(root, 'src', '1')
    const dst = join(root, 'dst')
    rmSync(root, { recursive: true, force: true })
    mkdirSyncAll(src)
    writeFileSync(join(src, 'a.txt'), 'aaa')
    writeFileSync(join(src, 'b.txt'), 'bb')
    expect(mirrorDirectory(join(root, 'src'), dst, true)).toEqual({ copied: 2, removed: 0 })
    expect(mirrorDirectory(join(root, 'src'), dst, true)).toEqual({ copied: 0, removed: 0 })
    writeFileSync(join(src, 'a.txt'), 'aaaa')
    rmSync(join(src, 'b.txt'))
    expect(mirrorDirectory(join(root, 'src'), dst, false)).toEqual({ copied: 1, removed: 0 })
    expect(existsSync(join(dst, '1', 'b.txt'))).toBe(true)
    expect(mirrorDirectory(join(root, 'src'), dst, true)).toEqual({ copied: 0, removed: 1 })
    expect([...listFiles(dst).keys()]).toEqual(['1/a.txt'])
    expect(readFileSync(join(dst, '1', 'a.txt'), 'utf8')).toBe('aaaa')
    rmSync(root, { recursive: true, force: true })
  })
})

function mkdirSyncAll(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

describe('BackupService', () => {
  let root: string
  let backupDir: string
  let dbPath: string
  let live: Db | null

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'easygrade-backup-'))
    backupDir = join(root, 'backup')
    dbPath = join(root, 'data', 'easygrade.db')
    live = null
  })

  function service(): BackupService {
    return new BackupService(settings, {
      dbPath,
      scansDir,
      attachmentsDir: `${scansDir}-attachments`,
      getDb: () => live ?? h.db,
      appVersion: '0.1.0-test',
      machineName: 'test-machine'
    })
  }

  it('refuses to back up without a folder', () => {
    expect(() => service().create()).toThrow(AppError)
    expect(service().status()).toMatchObject({ dir: null, dirOk: false, snapshots: [] })
  })

  it('snapshots the database, mirrors scans, writes a manifest, and rotates', () => {
    settings.set({ backupDir, backupKeep: 2 })
    const svc = service()
    const first = svc.create(new Date('2026-08-25T10:00:00Z'))
    expect(existsSync(first.snapshotPath)).toBe(true)
    expect(first.dbBytes).toBeGreaterThan(0)
    expect(first.scanFilesCopied).toBeGreaterThan(3)
    expect(first.snapshotsRemoved).toBe(0)
    expect(settings.get().lastBackupAt).toBe('2026-08-25T10:00:00.000Z')

    const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8')) as Record<string, unknown>
    expect(manifest.machineName).toBe('test-machine')
    expect(manifest.schemaVersion).toBe(5)
    expect(manifest.counts).toMatchObject({ results: 2, scanPages: 3 })

    const second = svc.create(new Date('2026-08-25T11:00:00Z'))
    expect(second.scanFilesCopied).toBe(0)
    const third = svc.create(new Date('2026-08-25T12:00:00Z'))
    expect(third.snapshotsRemoved).toBe(1)
    const status = svc.status()
    expect(status.dirOk).toBe(true)
    expect(status.snapshots).toHaveLength(2)
    expect(status.snapshots[0]?.path).toBe(third.snapshotPath)
    expect(status.scanBytes).toBeGreaterThan(0)
    expect(readdirSync(backupDir).filter((n) => n.endsWith('.part'))).toEqual([])

    // The snapshot is a real database with the same data.
    const probe = openDatabase({ path: third.snapshotPath })
    expect((probe.prepare('SELECT COUNT(*) AS n FROM results').get() as { n: number }).n).toBe(2)
    probe.close()
  })

  it('daily backups are due after 24 hours and only when configured', () => {
    const svc = service()
    expect(svc.isDailyBackupDue()).toBe(false)
    settings.set({ backupDir })
    mkdirSyncAll(backupDir)
    expect(svc.isDailyBackupDue()).toBe(true)
    settings.set({ lastBackupAt: new Date(Date.now() - 2 * 3600000).toISOString() })
    expect(svc.isDailyBackupDue()).toBe(false)
    settings.set({ lastBackupAt: new Date(Date.now() - 25 * 3600000).toISOString() })
    expect(svc.isDailyBackupDue()).toBe(true)
    settings.set({ backupOnQuit: false })
    expect(svc.isDailyBackupDue()).toBe(false)
    expect(svc.shouldBackupOnQuit()).toBe(false)
  })

  it('validates snapshots and restores one over a fresh data folder', () => {
    settings.set({ backupDir })
    const svc = service()
    const snap = svc.create()
    const bogus = join(root, 'bogus.db')
    writeFileSync(bogus, 'not a database')
    expect(() => svc.validateSnapshot(bogus)).toThrow(AppError)
    expect(() => svc.validateSnapshot(join(root, 'missing.db'))).toThrow(AppError)

    // Simulate a live db at dbPath that must be replaced, plus a local scans dir missing everything.
    live = openDatabase({ path: dbPath })
    live.prepare(`INSERT INTO sections (name, school_year, archived, created_at, updated_at) VALUES ('Old', '', 0, 'x', 'x')`).run()
    expect(() => svc.restore(snap.snapshotPath)).toThrow(AppError) // db still open
    live.close()
    live = null
    const restoreSvc = new BackupService(settings, { dbPath, scansDir: join(root, 'scans'), attachmentsDir: join(root, 'attachments'), getDb: () => null, appVersion: 't', machineName: 'm' })
    const outcome = restoreSvc.restore(snap.snapshotPath, new Date('2026-08-25T13:00:00Z'))
    expect(outcome.scanFilesCopied).toBeGreaterThan(3)
    expect(readdirSync(join(root, 'data')).some((n) => n.startsWith('easygrade.db.before-restore-'))).toBe(true)
    const restored = openDatabase({ path: dbPath })
    expect((restored.prepare('SELECT COUNT(*) AS n FROM results').get() as { n: number }).n).toBe(2)
    expect((restored.prepare(`SELECT COUNT(*) AS n FROM sections WHERE name = 'Old'`).get() as { n: number }).n).toBe(0)
    restored.close()
    expect(listFiles(join(root, 'scans')).size).toBe(listFiles(scansDir).size)
  })
})

describe('DataStore', () => {
  it('restores a snapshot in place: closes, swaps, reopens, and rebuilds the services', () => {
    const root = mkdtempSync(join(tmpdir(), 'easygrade-store-'))
    const store = new DataStore({ dbPath: join(root, 'data', 'easygrade.db'), scansDir: join(root, 'scans'), attachmentsDir: join(root, 'attachments'), appVersion: 't', machineName: 'm' })
    try {
      const before = store.open()
      const backupDir = join(root, 'backup')
      before.settings.set({ backupDir })
      const kept = before.sections.create({ name: 'Kept', schoolYear: '2026-27' })
      const snap = before.backup.create()
      before.sections.remove(kept.id)
      expect(before.sections.list(true)).toHaveLength(0)

      // A bad snapshot must leave the store open and untouched.
      const bogus = join(root, 'bogus.db')
      writeFileSync(bogus, 'not a database')
      expect(() => store.restore(bogus)).toThrow(AppError)
      expect(store.isOpen()).toBe(true)
      expect(store.current).toBe(before)

      const outcome = store.restore(snap.snapshotPath)
      expect(outcome.snapshotPath).toBe(snap.snapshotPath)
      expect(store.isOpen()).toBe(true)
      const after = store.current
      expect(after).not.toBe(before)
      expect(after.sections.list(true).map((s) => s.name)).toEqual(['Kept'])
      expect(readdirSync(join(root, 'data')).some((n) => n.startsWith('easygrade.db.before-restore-'))).toBe(true)
      // The rebuilt backup service sees the reopened database.
      expect(() => after.backup.create()).not.toThrow()
    } finally {
      store.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reset keeps the old database beside a fresh one, removes scans, and resets settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'easygrade-reset-'))
    const dbPath = join(root, 'data', 'easygrade.db')
    const scansDir = join(root, 'scans')
    const store = new DataStore({ dbPath, scansDir, attachmentsDir: `${scansDir}-attachments`, appVersion: 't', machineName: 'm' })
    try {
      const before = store.open()
      before.settings.set({ theme: 'light', backupDir: join(root, 'backup') })
      before.sections.create({ name: 'Gone', schoolYear: '2026-27' })
      mkdirSync(join(scansDir, '1'), { recursive: true })
      writeFileSync(join(scansDir, '1', 'page-001.png'), Buffer.alloc(1000))

      const outcome = store.reset(new Date('2026-08-25T14:00:00Z'))
      expect(outcome.keptDatabasePath).toBe(`${dbPath}.before-reset-2026-08-25_14-00-00`)
      expect(existsSync(outcome.keptDatabasePath ?? '')).toBe(true)
      expect(outcome.scanBytesRemoved).toBe(1000)
      expect(existsSync(scansDir)).toBe(false)
      expect(store.isOpen()).toBe(true)
      const after = store.current
      expect(after).not.toBe(before)
      expect(after.sections.list(true)).toHaveLength(0)
      expect(after.settings.get().theme).toBe('dark')
      expect(after.settings.get().backupDir).toBeNull()
      // The kept database still has the old data.
      const kept = openDatabase({ path: outcome.keptDatabasePath ?? '' })
      expect((kept.prepare(`SELECT COUNT(*) AS n FROM sections WHERE name = 'Gone'`).get() as { n: number }).n).toBe(1)
      kept.close()
    } finally {
      store.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
