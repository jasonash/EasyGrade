import type { ScanBatch } from '@shared/types'
import { useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { describeCounts } from '@/components/grading/BucketChips'
import { describeError } from './errors'

/**
 * The one way scans come in, shared by the Grading page and the empty results
 * state: open the picker, import, then summarize on a toast. When pages need
 * a decision the batch opens right away; otherwise the toast offers it.
 */
export function useScanImport(): { importing: boolean; importScans: () => Promise<ScanBatch | null> } {
  const importing = useScanStore((s) => s.importing)
  const pickAndImport = useScanStore((s) => s.pickAndImport)
  const toast = useUiStore((s) => s.toast)
  const openBatch = useUiStore((s) => s.openBatch)

  const importScans = async (): Promise<ScanBatch | null> => {
    try {
      const batch = await pickAndImport()
      if (!batch) return null
      const text = `Imported ${batch.pageCount} page${batch.pageCount === 1 ? '' : 's'}: ${describeCounts(batch.counts)}`
      const severity = batch.errors.length > 0 ? 'warning' : 'success'
      if (batch.counts.needs_assignment + batch.counts.unreadable > 0) {
        toast(severity, text)
        openBatch(batch.id)
      } else {
        toast(severity, text, { label: 'Open', onClick: () => openBatch(batch.id) })
      }
      return batch
    } catch (err) {
      toast('error', describeError(err))
      return null
    }
  }

  return { importing, importScans }
}
