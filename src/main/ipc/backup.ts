import { BrowserWindow, dialog } from 'electron'
import { IPC } from '@shared/ipc'
import type { BackupOutcome, BackupStatus, RestoreOutcome } from '@shared/types'
import type { Services } from '../services'
import { handle } from './handle'

export interface BackupHooks {
  /** Close the live database so the file can be replaced. */
  closeDb: () => void
  /** Restart the app after a restore (the renderer shows a notice first). */
  relaunch: () => void
}

/** Backup folder, snapshots, and restore. Restore closes the db, swaps files, then relaunches. */
export function registerBackupHandlers(services: Services, hooks: BackupHooks): void {
  const backup = services.backup

  handle<[], string | null>(IPC.backup.chooseDir, async () => {
    const win = focused()
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a backup folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: services.settings.get().backupDir ?? undefined
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const dir = result.filePaths[0]
    if (result.canceled || !dir) return null
    services.settings.set({ backupDir: dir })
    return dir
  })

  handle<[], BackupStatus>(IPC.backup.status, () => backup.status())
  handle<[], BackupOutcome>(IPC.backup.create, () => backup.create())

  handle<[], RestoreOutcome | null>(IPC.backup.restore, async () => {
    const win = focused()
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a backup to restore',
      properties: ['openFile'],
      defaultPath: services.settings.get().backupDir ?? undefined,
      filters: [
        { name: 'EasyGrade backup', extensions: ['db'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    backup.validateSnapshot(path)
    hooks.closeDb()
    const outcome = backup.restore(path)
    setTimeout(() => hooks.relaunch(), 1500)
    return outcome
  })
}

function focused(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}
