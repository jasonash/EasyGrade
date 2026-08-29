import * as m001 from './001_initial'
import * as m002 from './002_batch_errors'
import * as m003 from './003_batch_purged'
import * as m004 from './004_answer_sheets'

export interface Migration {
  version: number
  sql: string
}

/** Ordered list. Add new migrations at the end; never edit an applied one. */
export const migrations: Migration[] = [
  { version: m001.version, sql: m001.sql },
  { version: m002.version, sql: m002.sql },
  { version: m003.version, sql: m003.sql },
  { version: m004.version, sql: m004.sql }
]

/** Newest schema version this build understands (a restore refuses newer snapshots). */
export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1]?.version ?? 0
