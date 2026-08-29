import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import { IPC, type EasyGradeApi } from '@shared/ipc'
import type { ScanProgress, UpdateState } from '@shared/types'

const api: EasyGradeApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.app.info),
    copyText: (text) => ipcRenderer.invoke(IPC.app.copyText, text),
    setZoomFactor: (factor) => webFrame.setZoomFactor(factor)
  },
  sections: {
    list: (includeArchived) => ipcRenderer.invoke(IPC.sections.list, includeArchived),
    get: (id) => ipcRenderer.invoke(IPC.sections.get, id),
    create: (input) => ipcRenderer.invoke(IPC.sections.create, input),
    update: (input) => ipcRenderer.invoke(IPC.sections.update, input),
    remove: (id) => ipcRenderer.invoke(IPC.sections.remove, id),
    schoolYears: () => ipcRenderer.invoke(IPC.sections.schoolYears)
  },
  students: {
    listBySection: (sectionId, includeInactive) =>
      ipcRenderer.invoke(IPC.students.listBySection, sectionId, includeInactive),
    get: (id) => ipcRenderer.invoke(IPC.students.get, id),
    create: (input) => ipcRenderer.invoke(IPC.students.create, input),
    update: (input) => ipcRenderer.invoke(IPC.students.update, input),
    move: (input) => ipcRenderer.invoke(IPC.students.move, input),
    deactivate: (id) => ipcRenderer.invoke(IPC.students.deactivate, id),
    reactivate: (id) => ipcRenderer.invoke(IPC.students.reactivate, id),
    remove: (id) => ipcRenderer.invoke(IPC.students.remove, id),
    importPreview: (input) => ipcRenderer.invoke(IPC.students.importPreview, input),
    importCommit: (input) => ipcRenderer.invoke(IPC.students.importCommit, input),
    pickImportFile: () => ipcRenderer.invoke(IPC.students.pickImportFile),
    saveTemplate: () => ipcRenderer.invoke(IPC.students.saveTemplate)
  },
  tests: {
    list: (sectionId) => ipcRenderer.invoke(IPC.tests.list, sectionId),
    get: (id) => ipcRenderer.invoke(IPC.tests.get, id),
    create: (input) => ipcRenderer.invoke(IPC.tests.create, input),
    update: (input) => ipcRenderer.invoke(IPC.tests.update, input),
    updateAnswerSheet: (input) => ipcRenderer.invoke(IPC.tests.updateAnswerSheet, input),
    updateKey: (input) => ipcRenderer.invoke(IPC.tests.updateKey, input),
    finalize: (id) => ipcRenderer.invoke(IPC.tests.finalize, id),
    unlock: (id) => ipcRenderer.invoke(IPC.tests.unlock, id),
    copy: (input) => ipcRenderer.invoke(IPC.tests.copy, input),
    remove: (id) => ipcRenderer.invoke(IPC.tests.remove, id)
  },
  print: {
    preview: (input) => ipcRenderer.invoke(IPC.print.preview, input),
    savePdf: (input) => ipcRenderer.invoke(IPC.print.savePdf, input),
    printPdf: (input) => ipcRenderer.invoke(IPC.print.printPdf, input),
    listRuns: (testId) => ipcRenderer.invoke(IPC.print.listRuns, testId)
  },
  scan: {
    pickFiles: () => ipcRenderer.invoke(IPC.scan.pickFiles),
    importFiles: (paths) => ipcRenderer.invoke(IPC.scan.importFiles, paths),
    listBatches: () => ipcRenderer.invoke(IPC.scan.listBatches),
    getBatch: (batchId) => ipcRenderer.invoke(IPC.scan.getBatch, batchId),
    listPages: (batchId) => ipcRenderer.invoke(IPC.scan.listPages, batchId),
    getPage: (pageId) => ipcRenderer.invoke(IPC.scan.getPage, pageId),
    removeBatch: (batchId) => ipcRenderer.invoke(IPC.scan.removeBatch, batchId),
    assignPage: (input) => ipcRenderer.invoke(IPC.scan.assignPage, input),
    resolveConflict: (input) => ipcRenderer.invoke(IPC.scan.resolveConflict, input),
    discardPage: (pageId) => ipcRenderer.invoke(IPC.scan.discardPage, pageId),
    purgePreview: () => ipcRenderer.invoke(IPC.scan.purgePreview),
    purge: () => ipcRenderer.invoke(IPC.scan.purge),
    onProgress: (listener) => {
      const wrapped = (_event: IpcRendererEvent, progress: ScanProgress): void => listener(progress)
      ipcRenderer.on(IPC.scan.progress, wrapped)
      return () => {
        ipcRenderer.removeListener(IPC.scan.progress, wrapped)
      }
    }
  },
  grading: {
    resultsForTest: (testId) => ipcRenderer.invoke(IPC.grading.resultsForTest, testId),
    resultsForStudent: (studentId) => ipcRenderer.invoke(IPC.grading.resultsForStudent, studentId),
    getResult: (resultId) => ipcRenderer.invoke(IPC.grading.getResult, resultId),
    overrideAnswer: (input) => ipcRenderer.invoke(IPC.grading.overrideAnswer, input),
    setReviewed: (input) => ipcRenderer.invoke(IPC.grading.setReviewed, input),
    regradeTest: (testId) => ipcRenderer.invoke(IPC.grading.regradeTest, testId)
  },
  export: {
    testCsv: (testId) => ipcRenderer.invoke(IPC.export.testCsv, testId),
    sectionCsv: (sectionId) => ipcRenderer.invoke(IPC.export.sectionCsv, sectionId)
  },
  backup: {
    chooseDir: () => ipcRenderer.invoke(IPC.backup.chooseDir),
    status: () => ipcRenderer.invoke(IPC.backup.status),
    create: () => ipcRenderer.invoke(IPC.backup.create),
    restore: () => ipcRenderer.invoke(IPC.backup.restore),
    reset: () => ipcRenderer.invoke(IPC.backup.reset)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch) => ipcRenderer.invoke(IPC.settings.set, patch)
  },
  update: {
    getState: () => ipcRenderer.invoke(IPC.update.getState),
    check: () => ipcRenderer.invoke(IPC.update.check),
    download: () => ipcRenderer.invoke(IPC.update.download),
    install: () => ipcRenderer.invoke(IPC.update.install),
    onStatus: (listener) => {
      const wrapped = (_event: IpcRendererEvent, state: UpdateState): void => listener(state)
      ipcRenderer.on(IPC.update.status, wrapped)
      return () => {
        ipcRenderer.removeListener(IPC.update.status, wrapped)
      }
    }
  }
}

contextBridge.exposeInMainWorld('easygrade', api)
