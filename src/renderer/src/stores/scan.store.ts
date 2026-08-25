import { create } from 'zustand'
import type { ScanBatch, ScanPage, ScanProgress } from '@shared/types'
import { api, unwrap } from '@/api'

interface ScanState {
  batches: ScanBatch[]
  loading: boolean
  importing: boolean
  progress: ScanProgress | null
  load: () => Promise<void>
  /** Open the picker; resolves the finished batch, or null when the picker was cancelled. */
  pickAndImport: () => Promise<ScanBatch | null>
  listPages: (batchId: number) => Promise<ScanPage[]>
  removeBatch: (batchId: number) => Promise<void>
  /** Wire the progress channel once; returns the unsubscribe function. */
  subscribe: () => () => void
}

export const useScanStore = create<ScanState>((set) => ({
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
      await useScanStore.getState().load()
      return batch
    } finally {
      set({ importing: false })
    }
  },
  listPages: (batchId) => unwrap(api.scan.listPages(batchId)),
  removeBatch: async (batchId) => {
    await unwrap(api.scan.removeBatch(batchId))
    await useScanStore.getState().load()
  },
  subscribe: () => api.scan.onProgress((progress) => set({ progress }))
}))
