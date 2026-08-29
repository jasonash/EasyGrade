import { create } from 'zustand'
import type {
  AnswerSheetUpdateInput,
  Test,
  TestCopyInput,
  TestCreateInput,
  TestKeyUpdate,
  TestSummary,
  TestTotalPointsUpdate,
  TestUpdateInput
} from '@shared/types'
import { api, unwrap } from '@/api'
import { useSectionsStore } from './sections.store'

interface TestsState {
  tests: TestSummary[]
  loading: boolean
  load: () => Promise<void>
  get: (id: number) => Promise<Test>
  create: (input: TestCreateInput) => Promise<Test>
  update: (input: TestUpdateInput) => Promise<Test>
  updateAnswerSheet: (input: AnswerSheetUpdateInput) => Promise<Test>
  updateKey: (input: TestKeyUpdate) => Promise<Test>
  updateTotalPoints: (input: TestTotalPointsUpdate) => Promise<Test>
  finalize: (id: number) => Promise<Test>
  unlock: (id: number) => Promise<Test>
  copy: (input: TestCopyInput) => Promise<Test>
  remove: (id: number) => Promise<void>
  attachFile: (testId: number) => Promise<Test | null>
  removeAttachment: (testId: number) => Promise<Test>
  openAttachment: (testId: number) => Promise<void>
}

/** Test counts live on sections, so section lists refresh after test changes. */
async function refreshAll(): Promise<void> {
  await Promise.all([useTestsStore.getState().load(), useSectionsStore.getState().load()])
}

export const useTestsStore = create<TestsState>((set) => ({
  tests: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      set({ tests: await unwrap(api.tests.list()) })
    } finally {
      set({ loading: false })
    }
  },
  get: (id) => unwrap(api.tests.get(id)),
  create: async (input) => {
    const test = await unwrap(api.tests.create(input))
    await refreshAll()
    return test
  },
  update: async (input) => {
    const test = await unwrap(api.tests.update(input))
    // Keep the list in sync without a full reload on every autosave.
    set((state) => ({
      tests: state.tests.map((t) =>
        t.id === test.id ? { ...t, title: test.title, questionCount: test.questions.length, updatedAt: test.updatedAt } : t
      )
    }))
    return test
  },
  updateAnswerSheet: async (input) => {
    const test = await unwrap(api.tests.updateAnswerSheet(input))
    set((state) => ({
      tests: state.tests.map((t) =>
        t.id === test.id ? { ...t, title: test.title, questionCount: test.questions.length, updatedAt: test.updatedAt } : t
      )
    }))
    return test
  },
  updateKey: (input) => unwrap(api.tests.updateKey(input)),
  updateTotalPoints: async (input) => {
    const test = await unwrap(api.tests.updateTotalPoints(input))
    set((state) => ({ tests: state.tests.map((t) => (t.id === test.id ? { ...t, totalPoints: test.totalPoints, updatedAt: test.updatedAt } : t)) }))
    return test
  },
  finalize: async (id) => {
    const test = await unwrap(api.tests.finalize(id))
    await useTestsStore.getState().load()
    return test
  },
  unlock: async (id) => {
    const test = await unwrap(api.tests.unlock(id))
    await useTestsStore.getState().load()
    return test
  },
  copy: async (input) => {
    const test = await unwrap(api.tests.copy(input))
    await refreshAll()
    return test
  },
  remove: async (id) => {
    await unwrap(api.tests.remove(id))
    await refreshAll()
  },
  attachFile: (testId) => unwrap(api.tests.attachFile(testId)),
  removeAttachment: (testId) => unwrap(api.tests.removeAttachment(testId)),
  openAttachment: (testId) => unwrap(api.tests.openAttachment(testId))
}))
