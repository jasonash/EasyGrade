import { create } from 'zustand'
import type { Section, SectionInput, SectionUpdate } from '@shared/types'
import { api, unwrap } from '@/api'

interface SectionsState {
  sections: Section[]
  schoolYears: string[]
  loading: boolean
  /** False until the first list has arrived, so pages can show a skeleton instead of "No sections yet". */
  loaded: boolean
  includeArchived: boolean
  load: () => Promise<void>
  setIncludeArchived: (value: boolean) => Promise<void>
  create: (input: SectionInput) => Promise<Section>
  update: (input: SectionUpdate) => Promise<Section>
  remove: (id: number) => Promise<void>
}

export const useSectionsStore = create<SectionsState>((set, get) => ({
  sections: [],
  schoolYears: [],
  loading: false,
  loaded: false,
  includeArchived: false,
  load: async () => {
    set({ loading: true })
    try {
      const [sections, schoolYears] = await Promise.all([
        unwrap(api.sections.list(get().includeArchived)),
        unwrap(api.sections.schoolYears())
      ])
      set({ sections, schoolYears, loaded: true })
    } finally {
      set({ loading: false })
    }
  },
  setIncludeArchived: async (value) => {
    set({ includeArchived: value })
    await get().load()
  },
  create: async (input) => {
    const section = await unwrap(api.sections.create(input))
    await get().load()
    return section
  },
  update: async (input) => {
    const section = await unwrap(api.sections.update(input))
    await get().load()
    return section
  },
  remove: async (id) => {
    await unwrap(api.sections.remove(id))
    await get().load()
  }
}))
