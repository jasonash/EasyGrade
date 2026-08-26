import { create } from 'zustand'
import type { AssignOutcome, AssignPageInput, ResolveConflictInput, ScanBatch, ScanPageDetail, ScanProgress } from '@shared/types'
import { api, unwrap } from '@/api'

interface ScanState {
  batches: ScanBatch[]
  loading: boolean
  importing: boolean
  progress: ScanProgress | null
  load: () => Promise<void>
  /** Open the picker; resolves the finished batch, or null when the picker was cancelled. */
  pickAndImport: () => Promise<ScanBatch | null>
  getBatch: (batchId: number) => Promise<ScanBatch>
  listPages: (batchId: number) => Promise<ScanPageDetail[]>
  getPage: (pageId: number) => Promise<ScanPageDetail>
  removeBatch: (batchId: number) => Promise<void>
  assignPage: (input: AssignPageInput) => Promise<AssignOutcome>
  resolveConflict: (input: ResolveConflictInput) => Promise<ScanPageDetail>
  discardPage: (pageId: number) => Promise<ScanPageDetail>
  /** Wire the progress channel once; returns the unsubscribe function. */
  subscribe: () => () => void
}

/** Pages needing a teacher's attention in one batch: unassigned, unreadable, or graded with something to look at. */
export function batchAttention(b: ScanBatch): number {
  return b.counts.needs_assignment + b.counts.unreadable + b.unreviewedCount
}

/** Pages needing a teacher's attention across every batch (shown on the Grading nav item). */
export function attentionCount(batches: ScanBatch[]): number {
  return batches.reduce((sum, b) => sum + batchAttention(b), 0)
}

export const useScanStore = create<ScanState>((set, get) => ({
  batches: [],
  loading: false,
  importing: false,
  progress: null,
  load: async () => {
    set({ loading: true })
    try {
      set({ batches: await unwrap(api.scan.listBatches()) })
    } finally {
      set({ loading: false })
    }
  },
  pickAndImport: async () => {
    const paths = await unwrap(api.scan.pickFiles())
    if (!paths) return null
    set({ importing: true, progress: null })
    try {
      const batch = await unwrap(api.scan.importFiles(paths))
      await get().load()
      return batch
    } finally {
      set({ importing: false })
    }
  },
  getBatch: (batchId) => unwrap(api.scan.getBatch(batchId)),
  listPages: (batchId) => unwrap(api.scan.listPages(batchId)),
  getPage: (pageId) => unwrap(api.scan.getPage(pageId)),
  removeBatch: async (batchId) => {
    await unwrap(api.scan.removeBatch(batchId))
    await get().load()
  },
  assignPage: async (input) => {
    const outcome = await unwrap(api.scan.assignPage(input))
    if (outcome.status === 'assigned') await get().load()
    return outcome
  },
  resolveConflict: async (input) => {
    const page = await unwrap(api.scan.resolveConflict(input))
    await get().load()
    return page
  },
  discardPage: async (pageId) => {
    const page = await unwrap(api.scan.discardPage(pageId))
    await get().load()
    return page
  },
  subscribe: () => api.scan.onProgress((progress) => set({ progress }))
}))
