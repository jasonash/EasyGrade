import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { migrations } from './migrations'

export type Db = Database.Database

export interface OpenOptions {
  /** Absolute path to the database file, or ':memory:' for tests. */
  path: string
}

export function openDatabase(options: OpenOptions): Db {
  if (options.path !== ':memory:') {
    mkdirSync(dirname(options.path), { recursive: true })
  }
  const db = new Database(options.path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
  const applied = new Set(appliedRows.map((r) => r.version))
  const insert = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    const run = db.transaction(() => {
      db.exec(migration.sql)
      insert.run(migration.version, new Date().toISOString())
    })
    run()
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}
