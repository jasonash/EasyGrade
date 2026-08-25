import { app, BrowserWindow, shell } from 'electron'
import { hostname } from 'os'
import { rmSync } from 'fs'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { DataStore } from './data-store'
import { registerIpcHandlers, wireScanProgress } from './ipc'
import { handleScanProtocol, registerScanScheme } from './scan-protocol'

const APP_ID = 'com.jasonash.easygrade'
const DARK_BACKGROUND = '#14171c'

let store: DataStore | null = null

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

  mainWindow.on('ready-to-show', () => mainWindow.show())

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
      }
    }
  )
  setInterval(() => backupIfDue('daily'), DAILY_BACKUP_CHECK_MS)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  cleanTempPdfs()
  backupIfDue('quit')
  store?.close()
})
