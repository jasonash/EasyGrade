import type { Db } from '../database'

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  getAll(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const out: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.value)
      } catch {
        // Ignore corrupt values; defaults will apply.
      }
    }
    return out
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value))
  }
}
