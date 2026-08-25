import { app, BrowserWindow, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { IPC } from '@shared/ipc'
import type {
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
  TestUpdateInput
} from '@shared/types'
import { ROSTER_TEMPLATE_FILENAME } from '@shared/roster-import'
import type { Services } from '../services'
import { AppError } from '../services/errors'
import { handle } from './handle'
import { registerPrintHandlers } from './print'
import { registerScanHandlers } from './scan'

const MAX_IMPORT_BYTES = 1_000_000

export function registerIpcHandlers(services: Services): void {
  handle<[], AppInfo>(IPC.app.info, () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData')
  }))

  handle<[boolean | undefined], ReturnType<Services['sections']['list']>>(IPC.sections.list, (includeArchived) =>
    services.sections.list(includeArchived ?? false)
  )
  handle<[number], ReturnType<Services['sections']['get']>>(IPC.sections.get, (id) => services.sections.get(id))
  handle<[SectionInput], ReturnType<Services['sections']['create']>>(IPC.sections.create, (input) =>
    services.sections.create(input)
  )
  handle<[SectionUpdate], ReturnType<Services['sections']['update']>>(IPC.sections.update, (input) =>
    services.sections.update(input)
  )
  handle<[number], void>(IPC.sections.remove, (id) => services.sections.remove(id))
  handle<[], string[]>(IPC.sections.schoolYears, () => services.sections.schoolYears())

  const students = services.students
  handle<[number, boolean | undefined], ReturnType<typeof students.listBySection>>(
    IPC.students.listBySection,
    (sectionId, includeInactive) => students.listBySection(sectionId, includeInactive ?? false)
  )
  handle<[number], ReturnType<typeof students.get>>(IPC.students.get, (id) => students.get(id))
  handle<[StudentInput], ReturnType<typeof students.create>>(IPC.students.create, (input) => students.create(input))
  handle<[StudentUpdate], ReturnType<typeof students.update>>(IPC.students.update, (input) => students.update(input))
  handle<[StudentMove], ReturnType<typeof students.move>>(IPC.students.move, (input) => students.move(input))
  handle<[number], ReturnType<typeof students.deactivate>>(IPC.students.deactivate, (id) => students.deactivate(id))
  handle<[number], ReturnType<typeof students.reactivate>>(IPC.students.reactivate, (id) => students.reactivate(id))
  handle<[number], void>(IPC.students.remove, (id) => students.remove(id))
  handle<[ImportPreviewInput], ReturnType<typeof students.importPreview>>(IPC.students.importPreview, (input) =>
    students.importPreview(input)
  )
  handle<[ImportCommitInput], ReturnType<typeof students.importCommit>>(IPC.students.importCommit, (input) =>
    students.importCommit(input)
  )
  handle<[], PickedTextFile | null>(IPC.students.pickImportFile, () => pickImportFile())
  handle<[], string | null>(IPC.students.saveTemplate, () => saveTemplate(students.template()))

  const tests = services.tests
  handle<[number | undefined], ReturnType<typeof tests.list>>(IPC.tests.list, (sectionId) => tests.list(sectionId))
  handle<[number], ReturnType<typeof tests.get>>(IPC.tests.get, (id) => tests.get(id))
  handle<[TestCreateInput], ReturnType<typeof tests.create>>(IPC.tests.create, (input) => tests.create(input))
  handle<[TestUpdateInput], ReturnType<typeof tests.update>>(IPC.tests.update, (input) => tests.update(input))
  handle<[TestKeyUpdate], ReturnType<typeof tests.updateKey>>(IPC.tests.updateKey, (input) => tests.updateKey(input))
  handle<[number], ReturnType<typeof tests.finalize>>(IPC.tests.finalize, (id) => tests.finalize(id))
  handle<[number], ReturnType<typeof tests.unlock>>(IPC.tests.unlock, (id) => tests.unlock(id))
  handle<[TestCopyInput], ReturnType<typeof tests.copy>>(IPC.tests.copy, (input) => tests.copy(input))
  handle<[number], void>(IPC.tests.remove, (id) => tests.remove(id))

  registerPrintHandlers(services)
  registerScanHandlers(services)

  handle<[], ReturnType<Services['settings']['get']>>(IPC.settings.get, () => services.settings.get())
  handle<[SettingsPatch], ReturnType<Services['settings']['set']>>(IPC.settings.set, (patch) =>
    services.settings.set(patch)
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
