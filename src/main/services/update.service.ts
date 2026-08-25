import type { UpdateDisabledReason, UpdateState, UpdateStatus } from '@shared/types'

/**
 * The slice of electron-updater's AppUpdater this service needs, so tests can
 * drive the state machine with a fake and the service never imports Electron.
 */
export interface UpdaterEvents {
  'checking-for-update': () => void
  'update-available': (info: { version: string; releaseNotes?: unknown }) => void
  'update-not-available': (info: { version: string }) => void
  'download-progress': (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void
  'update-downloaded': (info: { version: string; releaseNotes?: unknown }) => void
  error: (error: Error) => void
}

export interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  // Overloads rather than a generic so electron-updater's own typed emitter is assignable.
  on(event: 'checking-for-update', listener: UpdaterEvents['checking-for-update']): unknown
  on(event: 'update-available', listener: UpdaterEvents['update-available']): unknown
  on(event: 'update-not-available', listener: UpdaterEvents['update-not-available']): unknown
  on(event: 'download-progress', listener: UpdaterEvents['download-progress']): unknown
  on(event: 'update-downloaded', listener: UpdaterEvents['update-downloaded']): unknown
  on(event: 'error', listener: UpdaterEvents['error']): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

export interface UpdateServiceOptions {
  updater: Updater
  currentVersion: string
  isPackaged: boolean
  /** Wait for the app to settle before the first check. */
  startupDelayMs?: number
  /** Silent re-check (or reminder about a downloaded update) cadence. */
  checkIntervalMs?: number
  log?: (message: string) => void
}

const DEFAULT_STARTUP_DELAY_MS = 5_000
const DEFAULT_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Dev builds are versioned like 1.2.0-dev.123 by the dev-build workflow and must never self-update. */
export function updateDisabledReason(isPackaged: boolean, version: string): UpdateDisabledReason | null {
  if (!isPackaged) return 'dev'
  if (version.includes('-dev.')) return 'dev-build'
  return null
}

/** Release notes arrive as a string, a list of per-version notes, or nothing. */
export function normalizeReleaseNotes(notes: unknown): string | null {
  if (typeof notes === 'string') return notes.trim() === '' ? null : notes
  if (Array.isArray(notes)) {
    const parts = notes
      .map((n) => (n && typeof n === 'object' && 'note' in n && typeof n.note === 'string' ? n.note : ''))
      .filter((n) => n.trim() !== '')
    return parts.length > 0 ? parts.join('\n') : null
  }
  return null
}

/**
 * Mirrors StraboMicro2's updater policy: check silently on startup and every
 * few hours, never download without the teacher's click, install on quit or
 * when they choose "Restart now". Every transition is pushed to listeners so
 * the renderer can show a snackbar or dialog.
 */
export class UpdateService {
  private readonly updater: Updater
  private readonly listeners = new Set<(state: UpdateState) => void>()
  private readonly startupDelayMs: number
  private readonly checkIntervalMs: number
  private readonly log: (message: string) => void
  private state: UpdateState
  private startupTimer: ReturnType<typeof setTimeout> | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private started = false

  constructor(options: UpdateServiceOptions) {
    this.updater = options.updater
    this.startupDelayMs = options.startupDelayMs ?? DEFAULT_STARTUP_DELAY_MS
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    this.log = options.log ?? (() => undefined)
    const disabledReason = updateDisabledReason(options.isPackaged, options.currentVersion)
    this.state = {
      enabled: disabledReason === null,
      disabledReason,
      currentVersion: options.currentVersion,
      status: { status: 'idle' }
    }
  }

  getState(): UpdateState {
    return this.state
  }

  onStatus(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Attach to the updater and schedule the startup and periodic checks. No-op when disabled. */
  start(): void {
    if (this.started || !this.state.enabled) return
    this.started = true
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true

    this.updater.on('checking-for-update', () => this.setStatus({ status: 'checking' }))
    this.updater.on('update-available', (info) => {
      this.log(`update available: ${info.version}`)
      this.setStatus({ status: 'available', version: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes) })
    })
    this.updater.on('update-not-available', (info) => this.setStatus({ status: 'not-available', version: info.version }))
    this.updater.on('download-progress', (progress) => {
      const version = this.knownVersion()
      this.setStatus({
        status: 'downloading',
        version,
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      })
    })
    this.updater.on('update-downloaded', (info) => {
      this.log(`update downloaded: ${info.version}`)
      this.setStatus({ status: 'downloaded', version: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes) })
    })
    this.updater.on('error', (error) => {
      const message = errorMessage(error)
      this.log(`updater error: ${message}`)
      const phase = this.state.status.status === 'downloading' ? 'download' : 'check'
      this.setStatus({ status: 'error', phase, message })
    })

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null
      void this.check()
    }, this.startupDelayMs)
    this.interval = setInterval(() => this.periodic(), this.checkIntervalMs)
  }

  stop(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer)
    if (this.interval) clearInterval(this.interval)
    this.startupTimer = null
    this.interval = null
  }

  /** Ask GitHub for a newer release. Resolves with the state after the check settles. */
  async check(): Promise<UpdateState> {
    if (!this.state.enabled) return this.state
    try {
      await this.updater.checkForUpdates()
    } catch (err) {
      this.setStatus({ status: 'error', phase: 'check', message: errorMessage(err) })
    }
    return this.state
  }

  async download(): Promise<UpdateState> {
    const current = this.state.status
    if (current.status !== 'available' && !(current.status === 'error' && current.phase === 'download')) return this.state
    const version = this.knownVersion()
    this.setStatus({ status: 'downloading', version, percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })
    try {
      await this.updater.downloadUpdate()
    } catch (err) {
      this.setStatus({ status: 'error', phase: 'download', message: errorMessage(err) })
    }
    return this.state
  }

  install(): void {
    if (this.state.status.status !== 'downloaded') return
    this.log('quitting to install the update')
    this.updater.quitAndInstall()
  }

  /** Every interval: remind about a downloaded update, otherwise check again unless one is already pending. */
  private periodic(): void {
    const status = this.state.status
    if (status.status === 'downloaded') {
      this.notify()
    } else if (status.status !== 'available' && status.status !== 'downloading') {
      void this.check()
    }
  }

  private knownVersion(): string | null {
    const status = this.state.status
    return 'version' in status && typeof status.version === 'string' ? status.version : null
  }

  private setStatus(status: UpdateStatus): void {
    this.state = { ...this.state, status }
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state)
  }
}

const MAX_ERROR_LENGTH = 200

/** First line only, capped: electron-updater errors can carry whole HTTP responses. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const line = raw.split('\n')[0]?.trim() ?? ''
  return line.length > MAX_ERROR_LENGTH ? `${line.slice(0, MAX_ERROR_LENGTH - 3)}...` : line
}
