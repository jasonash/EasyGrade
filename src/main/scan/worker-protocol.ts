import type { ScanContext, ScanPageResult } from '@shared/schemas'

/**
 * Messages between ScanService (main thread) and the scan worker. Images
 * cross the boundary as PNG bytes so the main thread only ever writes files.
 */

export interface ScanFileInput {
  path: string
  name: string
}

export interface ScanJob {
  files: ScanFileInput[]
  ctx: ScanContext
}

export type WorkerMessage =
  | { type: 'file'; file: string; pageCount: number }
  | { type: 'file-error'; file: string; message: string }
  | {
      type: 'page'
      file: string
      /** Page index within the file. */
      fileIndex: number
      result: ScanPageResult
      /** Canonical page PNG when aligned, otherwise the source page scaled to canonical width. */
      image: Uint8Array
      thumbnail: Uint8Array
      crops: Record<string, Uint8Array>
    }
  | { type: 'done' }
  | { type: 'fatal'; message: string }
