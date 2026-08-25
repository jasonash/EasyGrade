import * as m001 from './001_initial'
import * as m002 from './002_batch_errors'

export interface Migration {
  version: number
  sql: string
}

/** Ordered list. Add new migrations at the end; never edit an applied one. */
export const migrations: Migration[] = [
  { version: m001.version, sql: m001.sql },
  { version: m002.version, sql: m002.sql }
]
