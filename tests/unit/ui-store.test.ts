import { beforeEach, describe, expect, it } from 'vitest'
import { activeNavItem, navItemFor, useUiStore } from '../../src/renderer/src/stores/ui.store'

const store = useUiStore

function reset(): void {
  store.setState({
    page: 'sections',
    selectedSectionId: null,
    sectionTab: 'roster',
    selectedTestId: null,
    selectedBatchId: null,
    resultsTestId: null,
    resultsStudentId: null,
    history: [],
    toasts: []
  })
}

describe('ui.store navigation history', () => {
  beforeEach(reset)

  it('pushes on open and pops on close, restoring the section tab', () => {
    const s = store.getState()
    s.openSection(4, 'tests')
    s.openTest(9)
    expect(store.getState().page).toBe('test-editor')
    expect(store.getState().history).toHaveLength(2)
    store.getState().closeEditor()
    const after = store.getState()
    expect(after.page).toBe('section-detail')
    expect(after.selectedSectionId).toBe(4)
    expect(after.sectionTab).toBe('tests')
    expect(after.selectedTestId).toBeNull()
    expect(after.history).toHaveLength(1)
    after.closeSection()
    expect(store.getState().page).toBe('sections')
    expect(store.getState().history).toHaveLength(0)
  })

  it('falls back to the natural parent when nothing was pushed', () => {
    store.setState({ page: 'test-results', resultsTestId: 3 })
    store.getState().closeResults()
    expect(store.getState().page).toBe('tests')
    store.setState({ page: 'student-results', resultsStudentId: 3, history: [] })
    store.getState().closeResults()
    expect(store.getState().page).toBe('sections')
    store.setState({ page: 'batch-review', selectedBatchId: 1, history: [] })
    store.getState().closeBatch()
    expect(store.getState().page).toBe('grading')
  })

  it('walks results hops back one at a time', () => {
    const s = store.getState()
    s.navigate('tests')
    s.openTestResults(1)
    s.openStudentResults(7)
    s.openTestResults(2)
    expect(store.getState().history.map((h) => h.page)).toEqual(['tests', 'test-results', 'student-results'])
    store.getState().closeResults()
    expect(store.getState().page).toBe('student-results')
    expect(store.getState().resultsStudentId).toBe(7)
    store.getState().closeResults()
    expect(store.getState().page).toBe('test-results')
    expect(store.getState().resultsTestId).toBe(1)
    store.getState().closeResults()
    expect(store.getState().page).toBe('tests')
  })

  it('clears the trail on a rail click and highlights the rail item the trail started from', () => {
    const s = store.getState()
    s.navigate('sections')
    s.openSection(2)
    s.openTestResults(5)
    expect(activeNavItem(store.getState())).toBe('sections')
    store.getState().openTest(5)
    expect(activeNavItem(store.getState())).toBe('sections')
    store.getState().navigate('grading')
    expect(store.getState().history).toHaveLength(0)
    expect(activeNavItem(store.getState())).toBe('grading')
    store.getState().openBatch(1)
    store.getState().openTestResults(5)
    expect(activeNavItem(store.getState())).toBe('grading')
  })

  it('maps every page to a rail item when the trail is empty', () => {
    expect(navItemFor('student-results')).toBe('sections')
    expect(navItemFor('test-editor')).toBe('tests')
    expect(navItemFor('batch-review')).toBe('grading')
    expect(navItemFor('settings')).toBe('settings')
    store.setState({ page: 'test-results', history: [] })
    expect(activeNavItem(store.getState())).toBe('tests')
  })

  it('does not push a duplicate of the current location and caps the stack', () => {
    const s = store.getState()
    s.openTestResults(1)
    store.getState().openTestResults(1)
    expect(store.getState().history).toHaveLength(1)
    for (let i = 0; i < 50; i++) {
      store.getState().openStudentResults(i)
      store.getState().openTestResults(i)
    }
    expect(store.getState().history.length).toBeLessThanOrEqual(30)
  })
})
