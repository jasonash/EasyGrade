import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import type { ScanBatch } from '@shared/types'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ClickableRow } from '@/components/common/ClickableRow'
import { attentionCount, batchAttention, useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { formatShortDate } from '@/lib/format'
import { BucketChips } from '@/components/grading/BucketChips'
import { useScanImport } from '@/lib/scan-import'

/**
 * Grading landing page: import scans, watch the batch process, and see how
 * every page was bucketed. Bucket tabs and page review arrive in Phase 6.
 */
export function GradingPage(): JSX.Element {
  const batches = useScanStore((s) => s.batches)
  const loading = useScanStore((s) => s.loading)
  const progress = useScanStore((s) => s.progress)
  const load = useScanStore((s) => s.load)
  const { importing, importScans } = useScanImport()
  const removeBatch = useScanStore((s) => s.removeBatch)
  const subscribe = useScanStore((s) => s.subscribe)
  const toast = useUiStore((s) => s.toast)
  const openBatch = useUiStore((s) => s.openBatch)
  const [pendingDelete, setPendingDelete] = useState<ScanBatch | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [menu, setMenu] = useState<{ el: HTMLElement; batch: ScanBatch } | null>(null)

  useEffect(() => {
    void load().catch((err: unknown) => toast('error', describeError(err)))
    return subscribe()
  }, [load, subscribe, toast])

  const onImport = (): void => {
    void importScans()
  }

  const attention = attentionCount(batches)
  const newestWithAttention = batches.find((b) => batchAttention(b) > 0)

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

      {!importing && attention > 0 && newestWithAttention ? (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => openBatch(newestWithAttention.id)}>
              Review {attention} page{attention === 1 ? '' : 's'}
            </Button>
          }
        >
          {attention === 1 ? '1 page needs' : `${attention} pages need`} a decision before their sheets count.
        </Alert>
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
                <TableCell>Test</TableCell>
                <TableCell align="right">Pages</TableCell>
                <TableCell>Outcome</TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map((batch) => (
                <ClickableRow key={batch.id} onOpen={() => openBatch(batch.id)} label={`Open batch ${batch.sourceDescription}`}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(batch.importedAt)}</TableCell>
                  <TableCell sx={{ maxWidth: 420 }}>
                    {batch.tests.length > 0 ? (
                      <>
                        <Typography variant="body2" noWrap title={batch.tests.map((t) => `${t.title} (${t.sectionName})`).join(', ')}>
                          {batch.tests.map((t) => t.title).join(', ')}
                          <Typography component="span" variant="body2" color="text.secondary">
                            {batch.tests.length === 1 ? ` · ${batch.tests[0]?.sectionName ?? ''}` : ''}
                          </Typography>
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }} title={batch.sourceDescription}>
                          {batch.sourceDescription}
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2" noWrap title={batch.sourceDescription}>
                        {batch.sourceDescription}
                      </Typography>
                    )}
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
                      <BucketChips counts={batch.counts} toReview={batch.unreviewedCount} />
                    ) : (
                      <Chip size="small" label={batch.status} />
                    )}
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton
                      size="small"
                      aria-label="Batch actions"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenu({ el: e.currentTarget, batch })
                      }}
                      disabled={importing}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      <Menu anchorEl={menu?.el} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menu) openBatch(menu.batch.id)
            setMenu(null)
          }}
        >
          Open
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setPendingDelete(menu.batch)
            setMenu(null)
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          Delete batch
        </MenuItem>
      </Menu>

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
