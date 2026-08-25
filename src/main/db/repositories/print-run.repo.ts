import type { Db } from '../database'
import { nowIso } from '../database'
import type { PrintRun } from '@shared/types'

interface PrintRunRow {
  id: number
  test_id: number
  layout_version: number
  date_label: string | null
  student_ids_json: string
  blank_count: number
  printed_at: string
}

export interface PrintRunInsert {
  testId: number
  layoutVersion: number
  dateLabel: string | null
  studentIds: number[]
  blankCount: number
}

function parseIds(json: string): number[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : []
  } catch {
    return []
  }
}

function toRun(row: PrintRunRow): PrintRun {
  return {
    id: row.id,
    testId: row.test_id,
    layoutVersion: row.layout_version,
    dateLabel: row.date_label,
    studentIds: parseIds(row.student_ids_json),
    blankCount: row.blank_count,
    printedAt: row.printed_at
  }
}

export class PrintRunRepository {
  constructor(private readonly db: Db) {}

  listByTest(testId: number): PrintRun[] {
    const rows = this.db
      .prepare('SELECT * FROM print_runs WHERE test_id = ? ORDER BY printed_at DESC, id DESC')
      .all(testId) as PrintRunRow[]
    return rows.map(toRun)
  }

  /** Insert the run and stamp tests.last_printed_at in one transaction. */
  insert(input: PrintRunInsert): PrintRun {
    const ts = nowIso()
    const run = this.db.transaction((): number => {
      const info = this.db
        .prepare(
          `INSERT INTO print_runs (test_id, layout_version, date_label, student_ids_json, blank_count, printed_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(input.testId, input.layoutVersion, input.dateLabel, JSON.stringify(input.studentIds), input.blankCount, ts)
      this.db.prepare('UPDATE tests SET last_printed_at = ? WHERE id = ?').run(ts, input.testId)
      return Number(info.lastInsertRowid)
    })
    const id = run()
    const row = this.db.prepare('SELECT * FROM print_runs WHERE id = ?').get(id) as PrintRunRow | undefined
    if (!row) throw new Error('Print run insert failed')
    return toRun(row)
  }
}
