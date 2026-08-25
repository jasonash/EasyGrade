import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../../src/shared/types'
import {
  UpdateService,
  errorMessage,
  normalizeReleaseNotes,
  updateDisabledReason,
  type Updater,
  type UpdaterEvents
} from '../../src/main/services/update.service'

/** Fake electron-updater: records calls and lets tests fire events. */
class FakeUpdater implements Updater {
  autoDownload = true
  autoInstallOnAppQuit = false
  checks = 0
  downloads = 0
  installs = 0
  checkImpl: () => Promise<unknown> = async () => undefined
  downloadImpl: () => Promise<unknown> = async () => undefined
  private readonly handlers = new Map<keyof UpdaterEvents, Array<(...args: never[]) => void>>()

  on<E extends keyof UpdaterEvents>(event: E, listener: UpdaterEvents[E]): this {
    const list = this.handlers.get(event) ?? []
    list.push(listener as (...args: never[]) => void)
    this.handlers.set(event, list)
    return this
  }

  emit<E extends keyof UpdaterEvents>(event: E, ...args: Parameters<UpdaterEvents[E]>): void {
    for (const h of this.handlers.get(event) ?? []) (h as (...a: Parameters<UpdaterEvents[E]>) => void)(...args)
  }

  async checkForUpdates(): Promise<unknown> {
    this.checks += 1
    return this.checkImpl()
  }

  async downloadUpdate(): Promise<unknown> {
    this.downloads += 1
    return this.downloadImpl()
  }

  quitAndInstall(): void {
    this.installs += 1
  }
}

function make(overrides: { isPackaged?: boolean; version?: string } = {}): { updater: FakeUpdater; svc: UpdateService; seen: UpdateState[] } {
  const updater = new FakeUpdater()
  const svc = new UpdateService({
    updater,
    currentVersion: overrides.version ?? '1.0.0',
    isPackaged: overrides.isPackaged ?? true,
    startupDelayMs: 1000,
    checkIntervalMs: 10_000
  })
  const seen: UpdateState[] = []
  svc.onStatus((s) => seen.push(s))
  return { updater, svc, seen }
}

describe('UpdateService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is disabled when unpackaged or on a dev build, and then never touches the updater', async () => {
    expect(updateDisabledReason(false, '1.0.0')).toBe('dev')
    expect(updateDisabledReason(true, '1.2.0-dev.45')).toBe('dev-build')
    expect(updateDisabledReason(true, '1.2.0')).toBeNull()

    const { updater, svc } = make({ isPackaged: false })
    expect(svc.getState()).toMatchObject({ enabled: false, disabledReason: 'dev', currentVersion: '1.0.0', status: { status: 'idle' } })
    svc.start()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(updater.checks).toBe(0)
    expect((await svc.check()).enabled).toBe(false)
    expect(updater.checks).toBe(0)
  })

  it('checks after the startup delay and maps updater events to statuses', async () => {
    const { updater, svc, seen } = make()
    svc.start()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(updater.checks).toBe(1)

    updater.emit('checking-for-update')
    updater.emit('update-available', { version: '1.1.0', releaseNotes: '<p>Fixes</p>' })
    expect(svc.getState().status).toEqual({ status: 'available', version: '1.1.0', releaseNotes: '<p>Fixes</p>' })

    await svc.download()
    expect(updater.downloads).toBe(1)
    updater.emit('download-progress', { percent: 40, bytesPerSecond: 1000, transferred: 400, total: 1000 })
    expect(svc.getState().status).toEqual({ status: 'downloading', version: '1.1.0', percent: 40, transferred: 400, total: 1000, bytesPerSecond: 1000 })

    updater.emit('update-downloaded', { version: '1.1.0', releaseNotes: [{ version: '1.1.0', note: 'a' }, { version: '1.0.5', note: 'b' }] })
    expect(svc.getState().status).toEqual({ status: 'downloaded', version: '1.1.0', releaseNotes: 'a\nb' })
    svc.install()
    expect(updater.installs).toBe(1)
    expect(seen.map((s) => s.status.status)).toEqual(['checking', 'available', 'downloading', 'downloading', 'downloaded'])
  })

  it('reports check failures as check errors and download failures as download errors', async () => {
    const { updater, svc } = make()
    svc.start()
    updater.checkImpl = async () => {
      throw new Error('offline')
    }
    await svc.check()
    expect(svc.getState().status).toEqual({ status: 'error', phase: 'check', message: 'offline' })

    updater.emit('update-available', { version: '1.1.0' })
    updater.downloadImpl = async () => {
      throw new Error('disk full')
    }
    await svc.download()
    expect(svc.getState().status).toEqual({ status: 'error', phase: 'download', message: 'disk full' })
    // Retry is allowed from a download error.
    updater.downloadImpl = async () => undefined
    await svc.download()
    expect(updater.downloads).toBe(2)
    expect(svc.getState().status.status).toBe('downloading')
    // An updater-emitted error while downloading is also a download error.
    updater.emit('error', new Error('checksum'))
    expect(svc.getState().status).toEqual({ status: 'error', phase: 'download', message: 'checksum' })
  })

  it('ignores download and install requests outside the right states', async () => {
    const { updater, svc } = make()
    svc.start()
    await svc.download()
    svc.install()
    expect(updater.downloads).toBe(0)
    expect(updater.installs).toBe(0)
  })

  it('re-checks periodically, but only reminds while an update is downloaded or pending', async () => {
    const { updater, svc, seen } = make()
    svc.start()
    await vi.advanceTimersByTimeAsync(1000)
    updater.emit('update-not-available', { version: '1.0.0' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updater.checks).toBe(2)

    updater.emit('update-available', { version: '1.1.0' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updater.checks).toBe(2) // pending update: no re-check

    updater.emit('update-downloaded', { version: '1.1.0' })
    const before = seen.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updater.checks).toBe(2)
    expect(seen.length).toBe(before + 1) // reminder re-emits the downloaded state
    expect(seen.at(-1)?.status.status).toBe('downloaded')

    svc.stop()
    await vi.advanceTimersByTimeAsync(50_000)
    expect(seen.length).toBe(before + 1)
  })

  it('trims updater errors to a first line of bounded length', () => {
    expect(errorMessage(new Error('Cannot parse releases feed: 406\nHeaders: {...}\n<feed>...'))).toBe('Cannot parse releases feed: 406')
    expect(errorMessage('x'.repeat(300))).toHaveLength(200)
    expect(errorMessage(new Error('  spaced  '))).toBe('spaced')
  })

  it('normalizes release notes', () => {
    expect(normalizeReleaseNotes(undefined)).toBeNull()
    expect(normalizeReleaseNotes('  ')).toBeNull()
    expect(normalizeReleaseNotes('x')).toBe('x')
    expect(normalizeReleaseNotes([{ version: '1', note: 'a' }, { version: '2', note: ' ' }])).toBe('a')
    expect(normalizeReleaseNotes([])).toBeNull()
  })
})
