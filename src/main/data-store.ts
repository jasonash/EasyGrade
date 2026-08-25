import type { RestoreOutcome } from '@shared/types'
import { openDatabase, type Db } from './db/database'
import { createServices, type Services } from './services'
import { AppError } from './services/errors'

export interface DataStoreOptions {
  dbPath: string
  scansDir: string
  workerPath?: string
  appVersion: string
  machineName: string
}

/**
 * Owns the live database and the services built on it, so a restore can close
 * the database, swap the file, and reopen everything in the same process. The
 * IPC layer resolves services through {@link DataStore.current} on every call,
 * which is what lets a rebuilt set take over without re-registering handlers.
 */
export class DataStore {
  private db: Db | null = null
  private services: Services | null = null

  constructor(private readonly options: DataStoreOptions) {}

  /** Open the database (running migrations) and build the services. */
  open(): Services {
    if (this.services) return this.services
    const { dbPath, scansDir, workerPath, appVersion, machineName } = this.options
    this.db = openDatabase({ path: dbPath })
    this.services = createServices(
      this.db,
      { scansDir, workerPath },
      { dbPath, scansDir, getDb: () => this.db, appVersion, machineName }
    )
    return this.services
  }

  close(): void {
    this.db?.close()
    this.db = null
    this.services = null
  }

  isOpen(): boolean {
    return this.services !== null
  }

  /** The live services; throws while the store is closed (mid-restore). */
  get current(): Services {
    if (!this.services) throw new AppError('INTERNAL', 'The database is not open')
    return this.services
  }

  /**
   * Replace the live database with a snapshot and reopen. The store is
   * reopened even if the swap fails so the app stays usable either way.
   */
  restore(snapshotPath: string): RestoreOutcome {
    const backup = this.current.backup
    backup.validateSnapshot(snapshotPath)
    this.close()
    try {
      return backup.restore(snapshotPath)
    } finally {
      this.open()
    }
  }
}
