import { create } from 'zustand'
import type {
  ImportCommitInput,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewInput,
  Student,
  StudentInput,
  StudentMove,
  StudentUpdate
} from '@shared/types'
import { api, unwrap } from '@/api'
import { useSectionsStore } from './sections.store'

interface StudentsState {
  sectionId: number | null
  students: Student[]
  includeInactive: boolean
  loading: boolean
  load: (sectionId: number) => Promise<void>
  reload: () => Promise<void>
  setIncludeInactive: (value: boolean) => Promise<void>
  create: (input: StudentInput) => Promise<Student>
  update: (input: StudentUpdate) => Promise<Student>
  move: (input: StudentMove) => Promise<Student>
  deactivate: (id: number) => Promise<Student>
  reactivate: (id: number) => Promise<Student>
  remove: (id: number) => Promise<void>
  importPreview: (input: ImportPreviewInput) => Promise<ImportPreview>
  importCommit: (input: ImportCommitInput) => Promise<ImportCommitResult>
}

/** Student counts live on sections, so section lists refresh after roster changes. */
async function refreshSections(): Promise<void> {
  await useSectionsStore.getState().load()
}

export const useStudentsStore = create<StudentsState>((set, get) => ({
  sectionId: null,
  students: [],
  includeInactive: false,
  loading: false,
  load: async (sectionId) => {
    set({ sectionId, loading: true })
    try {
      const students = await unwrap(api.students.listBySection(sectionId, get().includeInactive))
      // Ignore a stale response if the user switched sections meanwhile.
      if (get().sectionId === sectionId) set({ students })
    } finally {
      set({ loading: false })
    }
  },
  reload: async () => {
    const id = get().sectionId
    if (id !== null) await get().load(id)
  },
  setIncludeInactive: async (value) => {
    set({ includeInactive: value })
    await get().reload()
  },
  create: async (input) => {
    const student = await unwrap(api.students.create(input))
    await Promise.all([get().reload(), refreshSections()])
    return student
  },
  update: async (input) => {
    const student = await unwrap(api.students.update(input))
    await Promise.all([get().reload(), refreshSections()])
    return student
  },
  move: async (input) => {
    const student = await unwrap(api.students.move(input))
    await Promise.all([get().reload(), refreshSections()])
    return student
  },
  deactivate: async (id) => {
    const student = await unwrap(api.students.deactivate(id))
    await Promise.all([get().reload(), refreshSections()])
    return student
  },
  reactivate: async (id) => {
    const student = await unwrap(api.students.reactivate(id))
    await Promise.all([get().reload(), refreshSections()])
    return student
  },
  remove: async (id) => {
    await unwrap(api.students.remove(id))
    await Promise.all([get().reload(), refreshSections()])
  },
  importPreview: (input) => unwrap(api.students.importPreview(input)),
  importCommit: async (input) => {
    const result = await unwrap(api.students.importCommit(input))
    await Promise.all([get().reload(), refreshSections()])
    return result
  }
}))
