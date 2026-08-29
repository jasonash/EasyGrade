import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { IPC } from '@shared/ipc'
import type {
  Test,
  AppInfo,
  ImportCommitInput,
  ImportPreviewInput,
  PickedTextFile,
  SectionInput,
  SectionUpdate,
  SettingsPatch,
  StudentInput,
  StudentMove,
  StudentUpdate,
  TestCopyInput,
  TestCreateInput,
  TestKeyUpdate,
  TestTotalPointsUpdate,
  TestUpdateInput,
  AnswerSheetUpdateInput
} from '@shared/types'
import { ROSTER_TEMPLATE_FILENAME } from '@shared/roster-import'
import type { Services } from '../services'
import { AppError } from '../services/errors'
import { ATTACHMENT_EXTENSIONS } from '../services/attachment.service'
import { handle } from './handle'
import { registerBackupHandlers, type BackupHooks } from './backup'
import { registerExportHandlers } from './export'
import { registerGradingHandlers } from './grading'
import { registerPrintHandlers } from './print'
import { registerScanHandlers, wireScanProgress } from './scan'
import { registerUpdateHandlers, wireUpdateStatus } from './update'

const MAX_IMPORT_BYTES = 1_000_000

export { wireScanProgress, registerUpdateHandlers, wireUpdateStatus }

/** Handlers resolve services through the getter on every call so a restore can rebuild them in place. */
export function registerIpcHandlers(services: () => Services, backupHooks: BackupHooks): void {
  handle<[], AppInfo>(IPC.app.info, () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData')
  }))
  handle<[string], void>(IPC.app.copyText, (text) => {
    clipboard.writeText(typeof text === 'string' ? text : '')
  })

  handle<[boolean | undefined], ReturnType<Services['sections']['list']>>(IPC.sections.list, (includeArchived) =>
    services().sections.list(includeArchived ?? false)
  )
  handle<[number], ReturnType<Services['sections']['get']>>(IPC.sections.get, (id) => services().sections.get(id))
  handle<[SectionInput], ReturnType<Services['sections']['create']>>(IPC.sections.create, (input) =>
    services().sections.create(input)
  )
  handle<[SectionUpdate], ReturnType<Services['sections']['update']>>(IPC.sections.update, (input) =>
    services().sections.update(input)
  )
  handle<[number], void>(IPC.sections.remove, (id) => services().sections.remove(id))
  handle<[], string[]>(IPC.sections.schoolYears, () => services().sections.schoolYears())

  type Students = Services['students']
  handle<[number, boolean | undefined], ReturnType<Students['listBySection']>>(
    IPC.students.listBySection,
    (sectionId, includeInactive) => services().students.listBySection(sectionId, includeInactive ?? false)
  )
  handle<[number], ReturnType<Students['get']>>(IPC.students.get, (id) => services().students.get(id))
  handle<[StudentInput], ReturnType<Students['create']>>(IPC.students.create, (input) => services().students.create(input))
  handle<[StudentUpdate], ReturnType<Students['update']>>(IPC.students.update, (input) => services().students.update(input))
  handle<[StudentMove], ReturnType<Students['move']>>(IPC.students.move, (input) => services().students.move(input))
  handle<[number], ReturnType<Students['deactivate']>>(IPC.students.deactivate, (id) => services().students.deactivate(id))
  handle<[number], ReturnType<Students['reactivate']>>(IPC.students.reactivate, (id) => services().students.reactivate(id))
  handle<[number], void>(IPC.students.remove, (id) => services().students.remove(id))
  handle<[ImportPreviewInput], ReturnType<Students['importPreview']>>(IPC.students.importPreview, (input) =>
    services().students.importPreview(input)
  )
  handle<[ImportCommitInput], ReturnType<Students['importCommit']>>(IPC.students.importCommit, (input) =>
    services().students.importCommit(input)
  )
  handle<[], PickedTextFile | null>(IPC.students.pickImportFile, () => pickImportFile())
  handle<[], string | null>(IPC.students.saveTemplate, () => saveTemplate(services().students.template()))

  type Tests = Services['tests']
  handle<[number | undefined], ReturnType<Tests['list']>>(IPC.tests.list, (sectionId) => services().tests.list(sectionId))
  handle<[number], ReturnType<Tests['get']>>(IPC.tests.get, (id) => services().tests.get(id))
  handle<[TestCreateInput], ReturnType<Tests['create']>>(IPC.tests.create, (input) => services().tests.create(input))
  handle<[TestUpdateInput], ReturnType<Tests['update']>>(IPC.tests.update, (input) => services().tests.update(input))
  handle<[AnswerSheetUpdateInput], ReturnType<Tests['updateAnswerSheet']>>(IPC.tests.updateAnswerSheet, (input) =>
    services().tests.updateAnswerSheet(input)
  )
  handle<[TestKeyUpdate], ReturnType<Tests['updateKey']>>(IPC.tests.updateKey, (input) => services().tests.updateKey(input))
  handle<[TestTotalPointsUpdate], ReturnType<Tests['updateTotalPoints']>>(IPC.tests.updateTotalPoints, (input) =>
    services().tests.updateTotalPoints(input)
  )
  handle<[number], ReturnType<Tests['finalize']>>(IPC.tests.finalize, (id) => services().tests.finalize(id))
  handle<[number], ReturnType<Tests['unlock']>>(IPC.tests.unlock, (id) => services().tests.unlock(id))
  handle<[TestCopyInput], ReturnType<Tests['copy']>>(IPC.tests.copy, (input) => services().tests.copy(input))
  handle<[number], void>(IPC.tests.remove, (id) => services().tests.remove(id))
  handle<[number], Test | null>(IPC.tests.attachFile, async (testId) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.OpenDialogOptions = {
      title: 'Attach the test',
      properties: ['openFile'],
      filters: [
        { name: 'PDF or image', extensions: [...ATTACHMENT_EXTENSIONS] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || path === undefined) return null
    return services().attachments.attach(testId, path)
  })
  handle<[number], Test>(IPC.tests.removeAttachment, (testId) => services().attachments.remove(testId))
  handle<[number], void>(IPC.tests.openAttachment, async (testId) => {
    const failure = await shell.openPath(services().attachments.filePath(testId))
    if (failure) throw new AppError('INTERNAL', `Could not open the file: ${failure}`)
  })

  registerPrintHandlers(services)
  registerScanHandlers(services)
  registerGradingHandlers(services)
  registerExportHandlers(services)
  registerBackupHandlers(services, backupHooks)

  handle<[], ReturnType<Services['settings']['get']>>(IPC.settings.get, () => services().settings.get())
  handle<[SettingsPatch], ReturnType<Services['settings']['set']>>(IPC.settings.set, (patch) =>
    services().settings.set(patch)
  )
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function pickImportFile(): Promise<PickedTextFile | null> {
  const win = focusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: 'Import roster',
    properties: ['openFile'],
    filters: [
      { name: 'Roster files', extensions: ['csv', 'tsv', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  const buffer = await readFile(path)
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new AppError('VALIDATION', 'That file is too large to be a roster (limit 1 MB).')
  }
  return { name: basename(path), text: buffer.toString('utf8') }
}

async function saveTemplate(csv: string): Promise<string | null> {
  const win = focusedWindow()
  const options: Electron.SaveDialogOptions = {
    title: 'Save roster template',
    defaultPath: join(app.getPath('downloads'), ROSTER_TEMPLATE_FILENAME),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, csv, 'utf8')
  return result.filePath
}
