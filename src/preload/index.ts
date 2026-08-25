import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type EasyGradeApi } from '@shared/ipc'

const api: EasyGradeApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.app.info)
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
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch) => ipcRenderer.invoke(IPC.settings.set, patch)
  }
}

contextBridge.exposeInMainWorld('easygrade', api)
