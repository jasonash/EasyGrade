import { app, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { ExportOutcome } from '@shared/types'
import type { Services } from '../services'
import type { CsvExport } from '../services/export.service'
import { handle } from './handle'

/** CSV exports: build in ExportService, ask where to save, remember the folder. */
export function registerExportHandlers(services: () => Services): void {
  handle<[number], ExportOutcome | null>(IPC.export.testCsv, (testId) => save(services(), services().exports.testCsv(testId)))
  handle<[number], ExportOutcome | null>(IPC.export.sectionCsv, (sectionId) => save(services(), services().exports.sectionCsv(sectionId)))
}

async function save(services: Services, built: CsvExport): Promise<ExportOutcome | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const dir = services.settings.get().lastExportDir ?? app.getPath('downloads')
  const options: Electron.SaveDialogOptions = {
    title: 'Export CSV',
    defaultPath: join(dir, built.fileName),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, built.csv, 'utf8')
  services.settings.set({ lastExportDir: dirname(result.filePath) })
  return { path: result.filePath, rows: built.rows }
}
