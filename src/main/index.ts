import { app, BrowserWindow, shell } from 'electron'
import { hostname } from 'os'
import { rmSync } from 'fs'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
import log from 'electron-log/main'
import { DataStore } from './data-store'
import { registerIpcHandlers, registerUpdateHandlers, wireScanProgress, wireUpdateStatus } from './ipc'
import { UpdateService } from './services/update.service'
import { handleScanProtocol, registerScanScheme } from './scan-protocol'

const APP_ID = 'com.jasonash.easygrade'
const DARK_BACKGROUND = '#14171c'

let store: DataStore | null = null
let updates: UpdateService | null = null
let splashWindow: BrowserWindow | null = null
let splashShownAt = 0
/** The splash stays up at least this long so it does not flash on fast machines. */
const MINIMUM_SPLASH_MS = 2000

const DAILY_BACKUP_CHECK_MS = 60 * 60 * 1000

registerScanScheme()

/** Backup on quit and daily while running; failures are logged, never fatal. */
function backupIfDue(reason: 'quit' | 'daily'): void {
  if (!store?.isOpen()) return
  try {
    const backup = store.current.backup
    const due = reason === 'quit' ? backup.shouldBackupOnQuit() : backup.isDailyBackupDue()
    if (due) backup.create()
  } catch (err) {
    console.error(`[backup] ${reason} backup failed:`, err)
  }
}

function cleanTempPdfs(): void {
  try {
    rmSync(join(app.getPath('temp'), 'easygrade-print'), { recursive: true, force: true })
  } catch {
    // Best effort.
  }
}

/** Static resources (splash page, icon): the project folder in dev, extraResources when packaged. */
function resourcesDir(): string {
  return is.dev ? join(__dirname, '../../resources') : join(process.resourcesPath, 'resources')
}

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: DARK_BACKGROUND,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  splashWindow.once('ready-to-show', () => {
    splashShownAt = Date.now()
    splashWindow?.show()
  })
  splashWindow.on('closed', () => {
    splashWindow = null
  })
  void splashWindow.loadFile(join(resourcesDir(), 'splash.html'), { query: { version: app.getVersion() } })
}

/** Close the splash (after its minimum time) and reveal the main window. */
function revealAfterSplash(mainWindow: BrowserWindow): void {
  const remaining = splashWindow ? Math.max(0, MINIMUM_SPLASH_MS - (Date.now() - splashShownAt)) : 0
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    splashWindow = null
    if (!mainWindow.isDestroyed()) mainWindow.show()
  }, remaining)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: DARK_BACKGROUND,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => revealAfterSplash(mainWindow))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_ID)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const scansDir = join(app.getPath('userData'), 'scans')
  const dbPath = join(app.getPath('userData'), 'easygrade.db')
  handleScanProtocol(scansDir)
  createSplashWindow()
  const dataStore = new DataStore({
    dbPath,
    scansDir,
    workerPath: join(__dirname, 'scan-worker.js'),
    appVersion: app.getVersion(),
    machineName: hostname()
  })
  store = dataStore
  wireScanProgress(dataStore.open())
  registerIpcHandlers(
    () => dataStore.current,
    {
      restore: (snapshotPath) => {
        const outcome = dataStore.restore(snapshotPath)
        wireScanProgress(dataStore.current)
        return outcome
      },
      reset: () => {
        const outcome = dataStore.reset()
        wireScanProgress(dataStore.current)
        return outcome
      }
    }
  )
  setInterval(() => backupIfDue('daily'), DAILY_BACKUP_CHECK_MS)

  // Automatic updates from GitHub Releases; the service itself decides whether
  // this build may update (packaged, not a -dev. build). electron-log writes
  // updater activity to userData/logs/main.log for field diagnosis.
  const { autoUpdater } = electronUpdater
  autoUpdater.logger = log
  updates = new UpdateService({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    log: (message) => log.info(`[updates] ${message}`)
  })
  wireUpdateStatus(updates)
  registerUpdateHandlers(updates)
  updates.start()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  updates?.stop()
  cleanTempPdfs()
  backupIfDue('quit')
  store?.close()
})
