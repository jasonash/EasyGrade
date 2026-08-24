/// <reference types="vite/client" />
import type { EasyGradeApi } from '@shared/ipc'

declare global {
  interface Window {
    easygrade: EasyGradeApi
  }
}

export {}
