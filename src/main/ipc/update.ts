import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { UpdateState } from '@shared/types'
import type { UpdateService } from '../services/update.service'
import { handle } from './handle'

/** Push every update transition to every window. */
export function wireUpdateStatus(updates: UpdateService): void {
  updates.onStatus((state: UpdateState) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.update.status, state)
    }
  })
}

export function registerUpdateHandlers(updates: UpdateService): void {
  handle<[], UpdateState>(IPC.update.getState, () => updates.getState())
  handle<[], UpdateState>(IPC.update.check, () => updates.check())
  handle<[], UpdateState>(IPC.update.download, () => updates.download())
  handle<[], void>(IPC.update.install, () => updates.install())
}
