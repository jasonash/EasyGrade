import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Chip, IconButton, Paper, Skeleton, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tooltip, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { PageBucket, ScanBatch, ScanPageDetail } from '@shared/types'
import { scanImageUrl } from '@shared/scan-url'
import { useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { formatShortDate } from '@/lib/format'
import { BUCKETS, describePage, flagLabel, formatPercent, percentOf } from '@/lib/grading'
import { EmptyState } from '@/components/common/EmptyState'
import { PageReviewDrawer } from '@/components/grading/PageReviewDrawer'

/** One batch: bucket tabs, a page list with thumbnails, and the Page Review drawer. */
export function BatchReviewPage(): JSX.Element {
  const batchId = useUiStore((s) => s.selectedBatchId)
  const closeBatch = useUiStore((s) => s.closeBatch)
  const toast = useUiStore((s) => s.toast)
  const getBatch = useScanStore((s) => s.getBatch)
  const listPages = useScanStore((s) => s.listPages)

  const [batch, setBatch] = useState<ScanBatch | null>(null)
  const [pages, setPages] = useState<ScanPageDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<PageBucket | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (batchId === null) return
    const [b, p] = await Promise.all([getBatch(batchId), listPages(batchId)])
    setBatch(b)
    setPages(p)
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

  const visible = useMemo(() => pages.filter((p) => p.bucket === tab), [pages, tab])

  if (batchId === null) return <Box />

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={closeBatch} aria-label="Back to grading" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }} noWrap title={batch?.sourceDescription}>
            {batch?.sourceDescription ?? 'Batch'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {batch ? `Imported ${formatShortDate(batch.importedAt)} · ${batch.pageCount} page${batch.pageCount === 1 ? '' : 's'}` : ''}
          </Typography>
        </Box>
      </Stack>

      {batch ? (
        <Tabs value={tab ?? 'graded'} onChange={(_, value: PageBucket) => setTab(value)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          {BUCKETS.filter((b) => b.key !== 'discarded' || batch.counts.discarded > 0).map((b) => (
            <Tab key={b.key} value={b.key} label={`${b.label} (${batch.counts[b.key]})`} />
          ))}
        </Tabs>
      ) : null}

      {loading && pages.length === 0 ? (
        <Skeleton variant="rounded" height={240} />
      ) : visible.length === 0 ? (
        <EmptyState title={`No ${BUCKETS.find((b) => b.key === tab)?.label.toLowerCase() ?? ''} pages`} description="Pick another tab to see the rest of the batch." />
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
                {tab === 'graded' ? <TableCell width={48} align="center">Reviewed</TableCell> : null}
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

      <PageReviewDrawer
        pageId={reviewId}
        onClose={() => setReviewId(null)}
        onChanged={() => {
          void load().catch((err: unknown) => toast('error', describeError(err)))
        }}
      />
    </>
  )
}

function PageRowView({ page, graded, onOpen }: { page: ScanPageDetail; graded: boolean; onOpen: () => void }): JSX.Element {
  const result = page.result
  return (
    <TableRow hover onClick={onOpen} sx={{ cursor: 'pointer' }}>
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
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {result?.flags.map((f) => <Chip key={`${f.q}-${f.kind}`} size="small" color="warning" variant="outlined" label={flagLabel(f)} />)}
            {result && result.overrides.length > 0 ? <Chip size="small" color="info" variant="outlined" label={`${result.overrides.length} edited`} /> : null}
            {page.alignmentQuality === 'weak' ? <Chip size="small" variant="outlined" label="weak alignment" /> : null}
          </Stack>
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
    </TableRow>
  )
}
