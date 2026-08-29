import { describe, expect, it, beforeEach } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { SectionRepository } from '../../src/main/db/repositories/section.repo'
import { SettingsRepository } from '../../src/main/db/repositories/settings.repo'
import { SectionService } from '../../src/main/services/section.service'
import { SettingsService } from '../../src/main/services/settings.service'
import { AppError } from '../../src/main/services/errors'

describe('database', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase({ path: ':memory:' })
  })

  it('applies migrations once and records them', () => {
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[]
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4])
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    for (const expected of [
      'sections',
      'students',
      'tests',
      'questions',
      'choices',
      'scan_batches',
      'scan_pages',
      'results',
      'answer_overrides',
      'print_runs',
      'settings'
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('enforces foreign keys', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO students (section_id, code, last_name, first_name, created_at, updated_at)
           VALUES (999, 'ABCDEF', 'Doe', 'Jane', 'x', 'x')`
        )
        .run()
    ).toThrow(/FOREIGN KEY/)
  })
})

describe('SectionService', () => {
  let service: SectionService

  beforeEach(() => {
    const db = openDatabase({ path: ':memory:' })
    service = new SectionService(new SectionRepository(db))
  })

  it('creates, lists, updates, archives, and deletes', () => {
    const created = service.create({ name: '  First Block  ', schoolYear: '2026-27' })
    expect(created.name).toBe('First Block')
    expect(created.studentCount).toBe(0)
    expect(service.list()).toHaveLength(1)

    const renamed = service.update({ id: created.id, name: 'Block 1' })
    expect(renamed.name).toBe('Block 1')

    service.update({ id: created.id, archived: true })
    expect(service.list()).toHaveLength(0)
    expect(service.list(true)).toHaveLength(1)

    service.remove(created.id)
    expect(service.list(true)).toHaveLength(0)
  })

  it('rejects blank names via the shared schema', () => {
    expect(() => service.create({ name: '   ', schoolYear: '' })).toThrow()
  })

  it('throws NOT_FOUND for unknown ids', () => {
    try {
      service.get(42)
      expect.fail('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('NOT_FOUND')
    }
  })

  it('lists distinct school years newest first', () => {
    service.create({ name: 'A', schoolYear: '2025-26' })
    service.create({ name: 'B', schoolYear: '2026-27' })
    service.create({ name: 'C', schoolYear: '2026-27' })
    service.create({ name: 'D', schoolYear: '' })
    expect(service.schoolYears()).toEqual(['2026-27', '2025-26'])
  })
})

describe('SettingsService', () => {
  it('returns defaults, persists patches, and ignores corrupt values', () => {
    const db = openDatabase({ path: ':memory:' })
    const repo = new SettingsRepository(db)
    const service = new SettingsService(repo)

    expect(service.get().theme).toBe('dark')
    expect(service.get().scanRetentionDays).toBe(180)

    service.set({ theme: 'light', defaultBlankCopies: 3 })
    expect(service.get()).toMatchObject({ theme: 'light', defaultBlankCopies: 3 })

    repo.set('theme', 'neon')
    expect(service.get().theme).toBe('dark')
    expect(service.get().defaultBlankCopies).toBe(3)
  })
})
