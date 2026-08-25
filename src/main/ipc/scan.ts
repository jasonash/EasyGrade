import { BrowserWindow, dialog } from 'electron'
import { IPC } from '@shared/ipc'
import type { ScanBatch, ScanPage, ScanProgress } from '@shared/types'
import type { Services } from '../services'
import { SUPPORTED_SCAN_EXTENSIONS } from '../scan/stages/rasterize'
import { handle } from './handle'

/**
 * Scan import handlers. The file picker and progress fan-out live here;
 * everything else is ScanService.
 */
export function registerScanHandlers(services: Services): void {
  const scan = services.scan

  scan.onProgress((progress: ScanProgress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.scan.progress, progress)
    }
  })

  handle<[], string[] | null>(IPC.scan.pickFiles, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.OpenDialogOptions = {
      title: 'Import scanned answer sheets',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Scans (PDF and images)', extensions: SUPPORTED_SCAN_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  handle<[string[]], ScanBatch>(IPC.scan.importFiles, (paths) => scan.importFiles(paths))
  handle<[], ScanBatch[]>(IPC.scan.listBatches, () => scan.listBatches())
  handle<[number], ScanBatch>(IPC.scan.getBatch, (id) => scan.getBatch(id))
  handle<[number], ScanPage[]>(IPC.scan.listPages, (id) => scan.listPages(id))
  handle<[number], void>(IPC.scan.removeBatch, (id) => scan.removeBatch(id))
}
