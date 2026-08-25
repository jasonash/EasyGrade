/**
 * Automatic updates (electron-updater over GitHub Releases). The main process
 * owns the state machine; the renderer only renders it and forwards clicks.
 */

export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes: string | null }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; version: string | null; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; releaseNotes: string | null }
  | { status: 'error'; phase: 'check' | 'download'; message: string }

/** Why automatic updates are off: running unpackaged, or a `-dev.` build from the dev-latest pre-release. */
export type UpdateDisabledReason = 'dev' | 'dev-build'

export interface UpdateState {
  enabled: boolean
  disabledReason: UpdateDisabledReason | null
  currentVersion: string
  status: UpdateStatus
}
