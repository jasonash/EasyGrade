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
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch) => ipcRenderer.invoke(IPC.settings.set, patch)
  }
}

contextBridge.exposeInMainWorld('easygrade', api)
