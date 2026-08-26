import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import type { ScanBatch } from '@shared/types'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { formatShortDate } from '@/lib/format'
import { BucketChips, describeCounts } from '@/components/grading/BucketChips'

/**
 * Grading landing page: import scans, watch the batch process, and see how
 * every page was bucketed. Bucket tabs and page review arrive in Phase 6.
 */
export function GradingPage(): JSX.Element {
  const batches = useScanStore((s) => s.batches)
  const loading = useScanStore((s) => s.loading)
  const importing = useScanStore((s) => s.importing)
  const progress = useScanStore((s) => s.progress)
  const load = useScanStore((s) => s.load)
  const pickAndImport = useScanStore((s) => s.pickAndImport)
  const removeBatch = useScanStore((s) => s.removeBatch)
  const subscribe = useScanStore((s) => s.subscribe)
  const toast = useUiStore((s) => s.toast)
  const openBatch = useUiStore((s) => s.openBatch)
  const [pendingDelete, setPendingDelete] = useState<ScanBatch | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    void load().catch((err: unknown) => toast('error', describeError(err)))
    return subscribe()
  }, [load, subscribe, toast])

  const onImport = (): void => {
    void pickAndImport()
      .then((batch) => {
        if (!batch) return
        const summary = describeCounts(batch.counts)
        toast(batch.errors.length > 0 ? 'warning' : 'success', `Imported ${batch.pageCount} page${batch.pageCount === 1 ? '' : 's'}: ${summary}`)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
  }

  const onDelete = (): void => {
    if (!pendingDelete) return
    setDeleting(true)
    void removeBatch(pendingDelete.id)
      .then(() => toast('success', 'Batch deleted'))
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => {
        setDeleting(false)
        setPendingDelete(null)
      })
  }

  return (
    <>
      <PageHeader
        title="Grading"
        subtitle="Import scanned answer sheets as PDFs or photos, then open a batch to review pages"
        actions={
          <Button variant="contained" startIcon={<UploadFileIcon />} onClick={onImport} disabled={importing}>
            Import scans...
          </Button>
        }
      />

      {importing ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }} aria-live="polite">
            {progressLabel(progress)}
          </Typography>
          <LinearProgress
            aria-label="Import progress"
            variant={progress && progress.pagesTotal > 0 ? 'determinate' : 'indeterminate'}
            value={progress && progress.pagesTotal > 0 ? (100 * progress.pagesDone) / progress.pagesTotal : 0}
          />
          {progress ? (
            <Box sx={{ mt: 1.5 }}>
              <BucketChips counts={progress.counts} />
            </Box>
          ) : null}
          {progress?.message ? (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {progress.message}
            </Alert>
          ) : null}
        </Paper>
      ) : null}

      {!loading && batches.length === 0 && !importing ? (
        <EmptyState
          title="No scans yet"
          description="Scan the answer sheets to PDF (or photograph them) and import the files here. Pages are matched to tests and students by their QR codes."
          action={
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={onImport}>
              Import scans...
            </Button>
          }
        />
      ) : null}

      {batches.length > 0 ? (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Imported</TableCell>
                <TableCell>Files</TableCell>
                <TableCell align="right">Pages</TableCell>
                <TableCell>Outcome</TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id} hover onClick={() => openBatch(batch.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(batch.importedAt)}</TableCell>
                  <TableCell sx={{ maxWidth: 360 }}>
                    <Typography variant="body2" noWrap title={batch.sourceDescription}>
                      {batch.sourceDescription}
                    </Typography>
                    {batch.purgedAt ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Page images purged {formatShortDate(batch.purgedAt)}
                      </Typography>
                    ) : null}
                    {batch.errors.length > 0 ? (
                      <Typography variant="caption" color="warning.main" noWrap title={batch.errors.join('\n')}>
                        {batch.errors.length} file problem{batch.errors.length === 1 ? '' : 's'}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">{batch.pageCount}</TableCell>
                  <TableCell>
                    {batch.status === 'complete' || batch.status === 'error' ? (
                      <BucketChips counts={batch.counts} />
                    ) : (
                      <Chip size="small" label={batch.status} />
                    )}
                  </TableCell>
                  <TableCell padding="checkbox">
                    <Tooltip title="Delete batch">
                      <span>
                        <IconButton
                          size="small"
                          aria-label="Delete batch"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPendingDelete(batch)
                          }}
                          disabled={importing}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this batch?"
        message={
          pendingDelete ? (
            <>
              This removes {pendingDelete.pageCount} scanned page{pendingDelete.pageCount === 1 ? '' : 's'} and any results graded
              from them. Pages that were scanned again later are unaffected.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={onDelete}
      />
    </>
  )
}

function progressLabel(progress: ReturnType<typeof useScanStore.getState>['progress']): string {
  if (!progress || progress.phase === 'starting') return 'Reading files...'
  if (progress.phase === 'complete') return 'Finishing...'
  const where = progress.currentFile ? ` (${progress.currentFile})` : ''
  return `Processing page ${Math.min(progress.pagesDone + 1, progress.pagesTotal)} of ${progress.pagesTotal}${where}`
}
