import { create } from 'zustand'

export type Page = 'sections' | 'tests' | 'grading' | 'settings'

export interface ToastMessage {
  id: number
  severity: 'success' | 'info' | 'warning' | 'error'
  text: string
}

interface UiState {
  page: Page
  toasts: ToastMessage[]
  navigate: (page: Page) => void
  toast: (severity: ToastMessage['severity'], text: string) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

export const useUiStore = create<UiState>((set) => ({
  page: 'sections',
  toasts: [],
  navigate: (page) => set({ page }),
  toast: (severity, text) =>
    set((state) => ({ toasts: [...state.toasts, { id: nextToastId++, severity, text }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
