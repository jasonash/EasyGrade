import * as m001 from './001_initial'

export interface Migration {
  version: number
  sql: string
}

/** Ordered list. Add new migrations at the end; never edit an applied one. */
export const migrations: Migration[] = [{ version: m001.version, sql: m001.sql }]
