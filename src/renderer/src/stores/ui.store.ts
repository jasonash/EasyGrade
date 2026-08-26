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
/** The pages reachable from the navigation rail. */
export type NavPage = 'sections' | 'tests' | 'grading' | 'settings'
export type SectionTab = 'roster' | 'tests'
export type TestStatusFilter = 'all' | 'draft' | 'finalized'

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

/** Everything that identifies where the user is, so a back arrow can restore it exactly. */
export interface Location {
  page: Page
  selectedSectionId: number | null
  sectionTab: SectionTab
  selectedTestId: number | null
  selectedBatchId: number | null
  resultsTestId: number | null
  resultsStudentId: number | null
}

/** Toolbar state of the global Tests page; kept here so it survives leaving the page. */
export interface TestsFilter {
  sectionId: number | null
  query: string
  status: TestStatusFilter
}

interface UiState extends Location {
  /**
   * Where each back arrow returns to: every `open*` pushes the location it
   * left, every `close*` pops it, and a navigation-rail click clears the
   * stack. The bottom entry (or the current page when empty) decides which
   * rail item is highlighted.
   */
  history: Location[]
  testsFilter: TestsFilter
  toasts: ToastMessage[]
  navigate: (page: NavPage) => void
  openSection: (sectionId: number, tab?: SectionTab) => void
  closeSection: () => void
  setSectionTab: (tab: SectionTab) => void
  openTest: (testId: number) => void
  closeEditor: () => void
  openBatch: (batchId: number) => void
  closeBatch: () => void
  openTestResults: (testId: number) => void
  openStudentResults: (studentId: number) => void
  closeResults: () => void
  setTestsFilter: (patch: Partial<TestsFilter>) => void
  toast: (severity: ToastMessage['severity'], text: string, action?: ToastAction) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

/** Ping-ponging between a test's results and a student's results must not grow without bound. */
const MAX_HISTORY = 30

const LOCATION_KEYS: (keyof Location)[] = [
  'page',
  'selectedSectionId',
  'sectionTab',
  'selectedTestId',
  'selectedBatchId',
  'resultsTestId',
  'resultsStudentId'
]

export const DEFAULT_TESTS_FILTER: TestsFilter = { sectionId: null, query: '', status: 'all' }

function snapshot(state: Location): Location {
  return {
    page: state.page,
    selectedSectionId: state.selectedSectionId,
    sectionTab: state.sectionTab,
    selectedTestId: state.selectedTestId,
    selectedBatchId: state.selectedBatchId,
    resultsTestId: state.resultsTestId,
    resultsStudentId: state.resultsStudentId
  }
}

function sameLocation(a: Location, b: Location): boolean {
  return LOCATION_KEYS.every((key) => a[key] === b[key])
}

/** Leave the current location for `next`, remembering where we were. */
function push(state: UiState, next: Partial<Location>): Partial<UiState> {
  const from = snapshot(state)
  const to = { ...from, ...next }
  if (sameLocation(from, to)) return {}
  const history = [...state.history, from].slice(-MAX_HISTORY)
  return { ...to, history }
}

/** Return to the location left behind, or to `fallback` when there is none. */
function back(state: UiState, fallback: Partial<Location>): Partial<UiState> {
  const previous = state.history[state.history.length - 1]
  if (previous) return { ...previous, history: state.history.slice(0, -1) }
  return { ...fallback, history: [] }
}

/** The rail item a page lives under when it is the root of the history. */
export function navItemFor(page: Page): NavPage {
  switch (page) {
    case 'sections':
    case 'section-detail':
    case 'student-results':
      return 'sections'
    case 'tests':
    case 'test-editor':
    case 'test-results':
      return 'tests'
    case 'grading':
    case 'batch-review':
      return 'grading'
    case 'settings':
      return 'settings'
  }
}

/** The rail item to highlight: where the current trail started. */
export function activeNavItem(state: { page: Page; history: Location[] }): NavPage {
  const root = state.history[0]
  return navItemFor(root ? root.page : state.page)
}

export const useUiStore = create<UiState>((set) => ({
  page: 'sections',
  selectedSectionId: null,
  sectionTab: 'roster',
  selectedTestId: null,
  selectedBatchId: null,
  resultsTestId: null,
  resultsStudentId: null,
  history: [],
  testsFilter: DEFAULT_TESTS_FILTER,
  toasts: [],
  navigate: (page) => set({ page, history: [] }),
  openSection: (sectionId, tab) =>
    set((state) => push(state, { page: 'section-detail', selectedSectionId: sectionId, sectionTab: tab ?? state.sectionTab })),
  closeSection: () => set((state) => back(state, { page: 'sections' })),
  setSectionTab: (tab) => set({ sectionTab: tab }),
  openTest: (testId) => set((state) => push(state, { page: 'test-editor', selectedTestId: testId })),
  closeEditor: () => set((state) => ({ ...back(state, { page: 'tests' }), selectedTestId: null })),
  openBatch: (batchId) => set((state) => push(state, { page: 'batch-review', selectedBatchId: batchId })),
  closeBatch: () => set((state) => ({ ...back(state, { page: 'grading' }), selectedBatchId: null })),
  openTestResults: (testId) => set((state) => push(state, { page: 'test-results', resultsTestId: testId })),
  openStudentResults: (studentId) => set((state) => push(state, { page: 'student-results', resultsStudentId: studentId })),
  closeResults: () => set((state) => back(state, { page: state.page === 'student-results' ? 'sections' : 'tests' })),
  setTestsFilter: (patch) => set((state) => ({ testsFilter: { ...state.testsFilter, ...patch } })),
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
