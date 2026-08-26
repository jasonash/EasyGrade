import { create } from 'zustand'

export type Page =
  | 'sections'
  | 'section-detail'
  | 'tests'
  | 'test-editor'
  | 'grading'
  | 'batch-review'
  | 'test-results'
  | 'student-results'
  | 'settings'
export type SectionTab = 'roster' | 'tests'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastMessage {
  id: number
  severity: 'success' | 'info' | 'warning' | 'error'
  text: string
  /** Optional button on the toast, e.g. Undo after a reversible change. */
  action?: ToastAction
}

interface UiState {
  page: Page
  selectedSectionId: number | null
  sectionTab: SectionTab
  selectedTestId: number | null
  /** Where the editor's back arrow returns to. */
  editorReturnPage: 'tests' | 'section-detail'
  selectedBatchId: number | null
  resultsTestId: number | null
  resultsStudentId: number | null
  /** Where a results page's back arrow returns to. */
  resultsReturnPage: Page
  toasts: ToastMessage[]
  navigate: (page: Page) => void
  openSection: (sectionId: number, tab?: SectionTab) => void
  setSectionTab: (tab: SectionTab) => void
  openTest: (testId: number) => void
  closeEditor: () => void
  openBatch: (batchId: number) => void
  closeBatch: () => void
  openTestResults: (testId: number) => void
  openStudentResults: (studentId: number) => void
  closeResults: () => void
  toast: (severity: ToastMessage['severity'], text: string, action?: ToastAction) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

const RESULTS_PAGES: Page[] = ['test-results', 'student-results']

export const useUiStore = create<UiState>((set) => ({
  page: 'sections',
  selectedSectionId: null,
  sectionTab: 'roster',
  selectedTestId: null,
  editorReturnPage: 'tests',
  selectedBatchId: null,
  resultsTestId: null,
  resultsStudentId: null,
  resultsReturnPage: 'tests',
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
  openBatch: (batchId) => set({ page: 'batch-review', selectedBatchId: batchId }),
  closeBatch: () => set({ page: 'grading', selectedBatchId: null }),
  openTestResults: (testId) =>
    set((state) => ({
      page: 'test-results',
      resultsTestId: testId,
      resultsReturnPage: RESULTS_PAGES.includes(state.page) ? state.resultsReturnPage : state.page
    })),
  openStudentResults: (studentId) =>
    set((state) => ({
      page: 'student-results',
      resultsStudentId: studentId,
      resultsReturnPage: RESULTS_PAGES.includes(state.page) ? state.resultsReturnPage : state.page
    })),
  closeResults: () => set((state) => ({ page: state.resultsReturnPage })),
  toast: (severity, text, action) =>
    set((state) => {
      // Repeating the same message (rapid key edits, retried saves) would queue
      // a parade of identical toasts; one is enough.
      const last = state.toasts[state.toasts.length - 1]
      if (last && last.severity === severity && last.text === text && !action) return state
      return { toasts: [...state.toasts, { id: nextToastId++, severity, text, action }] }
    }),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
