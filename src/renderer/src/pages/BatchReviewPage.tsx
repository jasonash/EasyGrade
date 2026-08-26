import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Chip, Paper, Skeleton, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tooltip, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AssessmentIcon from '@mui/icons-material/Assessment'
import type { PageBucket, ScanBatch, ScanPageDetail } from '@shared/types'
import { scanImageUrl } from '@shared/scan-url'
import { api, unwrap } from '@/api'
import { useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { formatShortDate } from '@/lib/format'
import { BUCKETS, describePage, formatPercent, percentOf } from '@/lib/grading'
import { EmptyState } from '@/components/common/EmptyState'
import { ClickableRow } from '@/components/common/ClickableRow'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PageHeader } from '@/components/common/PageHeader'
import { FlagChips } from '@/components/grading/FlagChips'
import { PageReviewDrawer } from '@/components/grading/PageReviewDrawer'

const ATTENTION: PageBucket[] = ['needs_assignment', 'unreadable']

type BulkAction = { kind: 'keep' | 'replace' | 'discard'; ids: number[] }

/** One batch: bucket tabs, a page list with thumbnails, and the Page Review drawer. */
export function BatchReviewPage(): JSX.Element {
  const batchId = useUiStore((s) => s.selectedBatchId)
  const closeBatch = useUiStore((s) => s.closeBatch)
  const openTestResults = useUiStore((s) => s.openTestResults)
  const toast = useUiStore((s) => s.toast)
  const getBatch = useScanStore((s) => s.getBatch)
  const listPages = useScanStore((s) => s.listPages)
  const reloadBatches = useScanStore((s) => s.load)

  const [batch, setBatch] = useState<ScanBatch | null>(null)
  const [pages, setPages] = useState<ScanPageDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<PageBucket | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [bulk, setBulk] = useState<BulkAction | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async (): Promise<ScanBatch | null> => {
    if (batchId === null) return null
    const [b, p] = await Promise.all([getBatch(batchId), listPages(batchId)])
    setBatch(b)
    setPages(p)
    return b
  }, [batchId, getBatch, listPages])

  useEffect(() => {
    setLoading(true)
    void load()
      .catch((err: unknown) => {
        toast('error', describeError(err))
        closeBatch()
      })
      .finally(() => setLoading(false))
  }, [load, toast, closeBatch])

  // First visit lands on the bucket that needs attention, if any.
  useEffect(() => {
    if (tab !== null || !batch) return
    const first = (['needs_assignment', 'unreadable', 'graded', 'not_a_sheet', 'discarded'] as PageBucket[]).find((b) => batch.counts[b] > 0)
    setTab(first ?? 'graded')
  }, [batch, tab])

  /** Refresh after a change; once an attention tab empties out, show the graded pages instead of a blank tab. */
  const refresh = useCallback((): void => {
    void load()
      .then((b) => {
        if (b && tab && ATTENTION.includes(tab) && b.counts[tab] === 0) setTab('graded')
      })
      .catch((err: unknown) => toast('error', describeError(err)))
  }, [load, tab, toast])

  const visible = useMemo(() => pages.filter((p) => p.bucket === tab), [pages, tab])
  const visibleIds = useMemo(() => visible.map((p) => p.id), [visible])
  const conflicts = useMemo(() => (tab === 'needs_assignment' ? visible.filter((p) => p.reason === 'conflict') : []), [visible, tab])
  const attention = batch ? batch.counts.needs_assignment + batch.counts.unreadable : 0
  const flaggedCount = useMemo(() => pages.filter((p) => p.bucket === 'graded' && (p.result?.flags.length ?? 0) > 0).length, [pages])
  const done = !loading && batch !== null && batch.status !== 'processing' && attention === 0 && batch.counts.graded > 0

  const runBulk = async (): Promise<void> => {
    if (!bulk) return
    setBulkBusy(true)
    let done = 0
    try {
      for (const id of bulk.ids) {
        if (bulk.kind === 'discard') await unwrap(api.scan.discardPage(id))
        else await unwrap(api.scan.resolveConflict({ pageId: id, action: bulk.kind }))
        done += 1
      }
      toast(
        'success',
        bulk.kind === 'keep'
          ? `Kept ${done} existing result${done === 1 ? '' : 's'}; the duplicate pages were discarded`
          : bulk.kind === 'replace'
            ? `Replaced ${done} result${done === 1 ? '' : 's'} with the new pages`
            : `Discarded ${done} page${done === 1 ? '' : 's'}`
      )
    } catch (err) {
      toast('error', `${describeError(err)} (${done} of ${bulk.ids.length} done)`)
    } finally {
      setBulkBusy(false)
      setBulk(null)
      await reloadBatches().catch(() => undefined)
      refresh()
    }
  }

  if (batchId === null) return <Box />

  const tabLabel = BUCKETS.find((b) => b.key === tab)?.label.toLowerCase() ?? ''

  return (
    <>
      <PageHeader
        title={batch && batch.tests.length > 0 ? batch.tests.map((t) => t.title).join(', ') : (batch?.sourceDescription ?? 'Batch')}
        subtitle={
          batch
            ? `Imported ${formatShortDate(batch.importedAt)} · ${batch.pageCount} page${batch.pageCount === 1 ? '' : 's'}${batch.tests.length > 0 ? ` · ${batch.sourceDescription}` : ''}`
            : undefined
        }
        onBack={closeBatch}
        backLabel="Back to grading"
      />

      {batch && batch.errors.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {batch.errors.map((e) => (
            <Box key={e}>{e}</Box>
          ))}
        </Alert>
      ) : null}

      {done && batch ? (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {batch.tests.slice(0, 3).map((t) => (
                <Button key={t.id} color="inherit" size="small" startIcon={<AssessmentIcon />} onClick={() => openTestResults(t.id)}>
                  {batch.tests.length === 1 ? 'Class results' : t.title}
                </Button>
              ))}
              <Button color="inherit" size="small" onClick={closeBatch}>
                Back to Grading
              </Button>
            </Stack>
          }
        >
          Every page in this batch is handled: {batch.counts.graded} graded
          {flaggedCount > 0 ? `, ${flaggedCount} with flags worth a look` : ''}.
        </Alert>
      ) : null}

      {batch ? (
        <Tabs
          value={tab ?? 'graded'}
          onChange={(_, value: PageBucket) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          {BUCKETS.filter((b) => b.key !== 'discarded' || batch.counts.discarded > 0).map((b) => (
            <Tab key={b.key} value={b.key} label={`${b.label} (${batch.counts[b.key]})`} />
          ))}
        </Tabs>
      ) : null}

      {tab && ATTENTION.includes(tab) && visible.length > 0 ? (
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {conflicts.length >= 2 ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                {conflicts.length} pages are rescans of graded results.
              </Typography>
              <Button size="small" variant="outlined" onClick={() => setBulk({ kind: 'keep', ids: conflicts.map((p) => p.id) })} disabled={bulkBusy}>
                Keep all existing ({conflicts.length})
              </Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => setBulk({ kind: 'replace', ids: conflicts.map((p) => p.id) })} disabled={bulkBusy}>
                Replace all ({conflicts.length})
              </Button>
            </>
          ) : null}
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" color="error" onClick={() => setBulk({ kind: 'discard', ids: visibleIds })} disabled={bulkBusy}>
            Discard remaining ({visible.length})
          </Button>
        </Stack>
      ) : null}

      {loading && pages.length === 0 ? (
        <Skeleton variant="rounded" height={240} />
      ) : visible.length === 0 ? (
        <EmptyState title={`No ${tabLabel} pages`} description="Pick another tab to see the rest of the batch." />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={72} />
                <TableCell width={56}>Page</TableCell>
                <TableCell>Test</TableCell>
                <TableCell>Student</TableCell>
                {tab === 'graded' ? <TableCell align="right">Score</TableCell> : null}
                <TableCell>{tab === 'graded' ? 'Flags' : 'Why'}</TableCell>
                {tab === 'graded' ? <TableCell align="center">Reviewed</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((page) => (
                <PageRowView key={page.id} page={page} graded={tab === 'graded'} onOpen={() => setReviewId(page.id)} />
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <PageReviewDrawer pageId={reviewId} pageIds={visibleIds} onNavigate={setReviewId} onClose={() => setReviewId(null)} onChanged={refresh} />

      <ConfirmDialog
        open={bulk !== null}
        title={bulk?.kind === 'keep' ? 'Keep the existing results?' : bulk?.kind === 'replace' ? 'Replace the existing results?' : 'Discard the remaining pages?'}
        message={
          bulk?.kind === 'keep'
            ? `The ${bulk.ids.length} results already graded stay exactly as they are, edits included. These ${bulk.ids.length} rescanned pages move to Discarded.`
            : bulk?.kind === 'replace'
              ? `${bulk.ids.length} existing results are replaced by these pages. Any answer edits and reviewed marks on the existing results are lost.`
              : `${bulk?.ids.length ?? 0} pages move to Discarded. They can be assigned later from the Discarded tab.`
        }
        confirmLabel={bulk?.kind === 'keep' ? 'Keep existing' : bulk?.kind === 'replace' ? 'Replace' : 'Discard'}
        destructive={bulk?.kind !== 'keep'}
        busy={bulkBusy}
        onClose={() => setBulk(null)}
        onConfirm={() => void runBulk()}
      />
    </>
  )
}

function PageRowView({ page, graded, onOpen }: { page: ScanPageDetail; graded: boolean; onOpen: () => void }): JSX.Element {
  const result = page.result
  return (
    <ClickableRow onOpen={onOpen} label={`Review page ${page.pageIndex + 1}${page.studentName ? `, ${page.studentName}` : ''}`}>
      <TableCell sx={{ py: 0.5 }}>
        {page.thumbPath ? (
          <Box sx={{ width: 56, height: 72, bgcolor: '#fff', borderRadius: 0.5, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
            <img src={scanImageUrl(page.thumbPath, page.processedAt)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
          </Box>
        ) : null}
      </TableCell>
      <TableCell>p.{page.pageIndex + 1}</TableCell>
      <TableCell>
        <Typography variant="body2" noWrap>
          {page.testTitle ?? <Typography component="span" variant="body2" color="text.secondary">Unknown</Typography>}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" noWrap>
          {page.studentName ?? <Typography component="span" variant="body2" color="text.secondary">Unassigned</Typography>}
        </Typography>
      </TableCell>
      {graded ? (
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
          {result ? `${result.correctCount}/${result.possibleCount} · ${formatPercent(percentOf(result.correctCount, result.possibleCount))}` : ''}
        </TableCell>
      ) : null}
      <TableCell>
        {graded ? (
          <FlagChips
            flags={result?.flags ?? []}
            extra={
              <>
                {result && result.overrides.length > 0 ? <Chip size="small" color="info" variant="outlined" label={`${result.overrides.length} edited`} /> : null}
                {page.alignmentQuality === 'weak' ? <Chip size="small" variant="outlined" label="weak alignment" /> : null}
              </>
            }
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
            {describePage(page)}
          </Typography>
        )}
      </TableCell>
      {graded ? (
        <TableCell align="center">
          {result?.reviewed ? (
            <Tooltip title="Reviewed">
              <CheckCircleIcon fontSize="small" color="success" />
            </Tooltip>
          ) : null}
        </TableCell>
      ) : null}
    </ClickableRow>
  )
}
