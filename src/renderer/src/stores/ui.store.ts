import { create } from 'zustand'

export type Page = 'sections' | 'section-detail' | 'tests' | 'test-editor' | 'grading' | 'settings'
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
  selectedTestId: number | null
  /** Where the editor's back arrow returns to. */
  editorReturnPage: 'tests' | 'section-detail'
  toasts: ToastMessage[]
  navigate: (page: Page) => void
  openSection: (sectionId: number, tab?: SectionTab) => void
  setSectionTab: (tab: SectionTab) => void
  openTest: (testId: number) => void
  closeEditor: () => void
  toast: (severity: ToastMessage['severity'], text: string) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

export const useUiStore = create<UiState>((set) => ({
  page: 'sections',
  selectedSectionId: null,
  sectionTab: 'roster',
  selectedTestId: null,
  editorReturnPage: 'tests',
  toasts: [],
  navigate: (page) => set({ page }),
  openSection: (sectionId, tab) =>
    set((state) => ({ page: 'section-detail', selectedSectionId: sectionId, sectionTab: tab ?? state.sectionTab })),
  setSectionTab: (tab) => set({ sectionTab: tab }),
  openTest: (testId) =>
    set((state) => ({
      page: 'test-editor',
      selectedTestId: testId,
      editorReturnPage: state.page === 'section-detail' ? 'section-detail' : 'tests'
    })),
  closeEditor: () => set((state) => ({ page: state.editorReturnPage, selectedTestId: null })),
  toast: (severity, text) =>
    set((state) => ({ toasts: [...state.toasts, { id: nextToastId++, severity, text }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
