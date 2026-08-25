import { app, BrowserWindow, dialog, shell } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { IPC } from '@shared/ipc'
import type { PrintOutcome, PrintRequest, PrintRun } from '@shared/types'
import type { Services } from '../services'
import type { GeneratedPdf } from '../services/print.service'
import { AppError } from '../services/errors'
import { handle } from './handle'

/**
 * Print handlers. Generation happens in PrintService; this file owns the
 * filesystem, dialogs, and handing the PDF to the operating system.
 *
 * "Print" opens the PDF in the system viewer (Preview, Acrobat, Edge) and the
 * teacher prints from there. Electron's own PDF viewer cannot be printed
 * reliably through webContents.print, and a silent `lp` would skip printer
 * selection, so the OS viewer is the dependable path on every platform.
 */
export function registerPrintHandlers(services: () => Services): void {
  const print = (): Services['print'] => services().print

  handle<[PrintRequest], PrintOutcome>(IPC.print.preview, async (input) => {
    const generated = await print().generate(input)
    const path = await writeTemp(generated)
    await openWithSystem(path)
    return print().outcome(generated, path, null)
  })

  handle<[PrintRequest], PrintOutcome | null>(IPC.print.savePdf, async (input) => {
    const generated = await print().generate(input)
    const settings = services().settings.get()
    const win = focusedWindow()
    const options: Electron.SaveDialogOptions = {
      title: 'Save answer sheets',
      defaultPath: join(settings.lastExportDir ?? app.getPath('downloads'), generated.fileName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, generated.buffer)
    services().settings.set({ lastExportDir: dirname(result.filePath) })
    const run = print().record(generated)
    return print().outcome(generated, result.filePath, run)
  })

  handle<[PrintRequest], PrintOutcome>(IPC.print.printPdf, async (input) => {
    const generated = await print().generate(input)
    const path = await writeTemp(generated)
    await openWithSystem(path)
    const run = print().record(generated)
    return print().outcome(generated, path, run)
  })

  handle<[number], PrintRun[]>(IPC.print.listRuns, (testId) => print().listRuns(testId))
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function writeTemp(generated: GeneratedPdf): Promise<string> {
  const dir = join(app.getPath('temp'), 'easygrade-print')
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(dir, generated.fileName.replace(/\.pdf$/, `-${stamp}.pdf`))
  await writeFile(path, generated.buffer)
  return path
}

async function openWithSystem(path: string): Promise<void> {
  const error = await shell.openPath(path)
  if (error !== '') throw new AppError('IO', `Could not open the PDF: ${error}`)
}
