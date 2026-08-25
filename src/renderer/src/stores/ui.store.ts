import { create } from 'zustand'

export type Page = 'sections' | 'section-detail' | 'tests' | 'grading' | 'settings'
export type SectionTab = 'roster' | 'tests'

export interface ToastMessage {
  id: number
  severity: 'success' | 'info' | 'warning' | 'error'
  text: string
}

interface UiState {
  page: Page
  selectedSectionId: number | null
  sectionTab: SectionTab
  toasts: ToastMessage[]
  navigate: (page: Page) => void
  openSection: (sectionId: number, tab?: SectionTab) => void
  setSectionTab: (tab: SectionTab) => void
  toast: (severity: ToastMessage['severity'], text: string) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

export const useUiStore = create<UiState>((set) => ({
  page: 'sections',
  selectedSectionId: null,
  sectionTab: 'roster',
  toasts: [],
  navigate: (page) => set({ page }),
  openSection: (sectionId, tab) =>
    set((state) => ({ page: 'section-detail', selectedSectionId: sectionId, sectionTab: tab ?? state.sectionTab })),
  setSectionTab: (tab) => set({ sectionTab: tab }),
  toast: (severity, text) =>
    set((state) => ({ toasts: [...state.toasts, { id: nextToastId++, severity, text }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
