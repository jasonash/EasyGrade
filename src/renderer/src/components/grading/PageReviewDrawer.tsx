import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Chip, Divider, Drawer, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import type { ScanPageDetail, Test } from '@shared/types'
import { api, unwrap } from '@/api'
import { useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { gradingApi } from '@/lib/grading-api'
import { describeError } from '@/lib/errors'
import { BUCKETS, formatPercent, percentOf } from '@/lib/grading'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Code } from '@/components/common/Code'
import { AnswerRows } from './AnswerRows'
import { AssignPanel } from './AssignPanel'
import { PageImage } from './PageImage'

interface Props {
  pageId: number | null
  onClose: () => void
  /** Anything changed (override, assignment, discard); lists behind the drawer should refresh. */
  onChanged: () => void
}

/**
 * Right-hand drawer for one scanned page. Graded pages show the answer rows
 * with override controls; everything else shows the assignment panel.
 */
export function PageReviewDrawer({ pageId, onClose, onChanged }: Props): JSX.Element {
  const getPage = useScanStore((s) => s.getPage)
  const discardPage = useScanStore((s) => s.discardPage)
  const toast = useUiStore((s) => s.toast)

  const [page, setPage] = useState<ScanPageDetail | null>(null)
  const [test, setTest] = useState<Test | null>(null)
  const [loading, setLoading] = useState(false)
  const [reassign, setReassign] = useState(false)
  const [busyQ, setBusyQ] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const load = useCallback(
    async (id: number): Promise<void> => {
      const loaded = await getPage(id)
      setPage(loaded)
      if (loaded.testId !== null) {
        setTest(await unwrap(api.tests.get(loaded.testId)).catch(() => null))
      } else {
        setTest(null)
      }
    },
    [getPage]
  )

  useEffect(() => {
    if (pageId === null) {
      setPage(null)
      setTest(null)
      setReassign(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setReassign(false)
    void load(pageId)
      .catch((err: unknown) => {
        if (!cancelled) {
          toast('error', describeError(err))
          onClose()
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pageId, load, toast, onClose])

  const result = page?.result ?? null
  const reviewMode = page?.bucket === 'graded' && result !== null && test !== null && !reassign

  const overlay = useMemo(() => {
    if (!page) return { answers: null, answerKey: null, flagged: new Set<number>() }
    if (reviewMode && result && test) {
      return {
        answers: result.finalAnswers,
        answerKey: test.questions.map((q) => q.correctChoice),
        flagged: new Set(result.flags.map((f) => f.q))
      }
    }
    const detected = page.detected
    return {
      answers: detected ? detected.map((r) => (r.state === 'filled' ? r.choice : null)) : null,
      answerKey: null,
      flagged: new Set(detected ? detected.filter((r) => r.state !== 'filled').map((r) => r.q) : [])
    }
  }, [page, result, test, reviewMode])

  const onOverride = (q: number, choice: number | null | 'reset'): void => {
    if (!result) return
    setBusyQ(q)
    void gradingApi
      .overrideAnswer({ resultId: result.id, q, override: choice === 'reset' ? null : { choice } })
      .then((updated) => {
        setPage((prev) => (prev ? { ...prev, result: updated } : prev))
        onChanged()
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusyQ(null))
  }

  const toggleReviewed = (): void => {
    if (!result) return
    setBusy(true)
    void gradingApi
      .setReviewed({ resultId: result.id, reviewed: !result.reviewed })
      .then((updated) => {
        setPage((prev) => (prev ? { ...prev, result: updated } : prev))
        onChanged()
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(false))
  }

  const discard = (): void => {
    if (!page) return
    setBusy(true)
    void discardPage(page.id)
      .then((updated) => {
        setDiscardOpen(false)
        setPage(updated)
        toast('info', 'Page discarded')
        onChanged()
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(false))
  }

  const afterAssign = (updated: ScanPageDetail): void => {
    setReassign(false)
    onChanged()
    void load(updated.id).catch((err: unknown) => toast('error', describeError(err)))
  }

  const bucketMeta = page ? BUCKETS.find((b) => b.key === page.bucket) : undefined
  const score = result ? `${result.correctCount}/${result.possibleCount}` : null
  const percent = result ? formatPercent(percentOf(result.correctCount, result.possibleCount)) : ''

  return (
    <Drawer
      anchor="right"
      open={pageId !== null}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      slotProps={{ paper: { sx: { width: { xs: '100vw', md: 940 }, maxWidth: '100vw' } } }}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap role="status" aria-live="polite">
              {page ? `Page ${page.pageIndex + 1}` : 'Page'}
              {page?.studentName ? ` · ${page.studentName}` : ''}
              {score ? ` · ${score} (${percent})` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {page?.testTitle ?? (page ? 'No test identified' : '')}
              {page?.sectionName ? ` · ${page.sectionName}` : ''}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close review" edge="end">
            <CloseIcon />
          </IconButton>
        </Stack>

        {page ? (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            {bucketMeta ? <Chip size="small" color={bucketMeta.color} variant={bucketMeta.color === 'default' ? 'outlined' : 'filled'} label={bucketMeta.label} /> : null}
            {result?.reviewed ? <Chip size="small" icon={<CheckCircleIcon />} label="Reviewed" color="success" variant="outlined" /> : null}
            {page.assignedBy === 'teacher' ? <Chip size="small" variant="outlined" label="Assigned by you" /> : null}
            {page.alignmentQuality === 'weak' ? (
              <Tooltip title="The page aligned, but not precisely. Check faint or borderline bubbles.">
                <Chip size="small" color="warning" variant="outlined" label="Weak alignment" />
              </Tooltip>
            ) : null}
            {page.rotation ? <Chip size="small" variant="outlined" label={`Rotated ${page.rotation}°`} /> : null}
            {result && result.overrides.length > 0 ? <Chip size="small" color="info" variant="outlined" label={`${result.overrides.length} edited`} /> : null}
          </Stack>
        ) : null}

        {loading || !page ? (
          <Skeleton variant="rounded" height={400} />
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' }, gap: 2, alignItems: 'start', flexGrow: 1 }}>
            <Box sx={{ position: { md: 'sticky' }, top: 0 }}>
              <PageImage page={page} layout={test?.layout ?? null} answers={overlay.answers} answerKey={overlay.answerKey} flagged={overlay.flagged} />
              {page.qrPayload ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  <Code>{page.qrPayload}</Code>
                </Typography>
              ) : null}
            </Box>

            <Box>
              {reviewMode && result && test ? (
                <>
                  <AnswerRows questions={test.questions} result={result} page={page} busyQ={busyQ} onOverride={onOverride} />
                  <Divider sx={{ my: 2 }} />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      variant={result.reviewed ? 'contained' : 'outlined'}
                      color="success"
                      startIcon={result.reviewed ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
                      onClick={toggleReviewed}
                      disabled={busy}
                    >
                      {result.reviewed ? 'Reviewed' : 'Mark reviewed'}
                    </Button>
                    <Button variant="outlined" startIcon={<SwapHorizIcon />} onClick={() => setReassign(true)} disabled={busy}>
                      Reassign
                    </Button>
                    <Box sx={{ flexGrow: 1 }} />
                    <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDiscardOpen(true)} disabled={busy}>
                      Discard
                    </Button>
                  </Stack>
                </>
              ) : (
                <AssignPanel
                  key={`${page.id}-${reassign ? 'reassign' : page.bucket ?? ''}`}
                  page={page}
                  reassign={reassign}
                  onAssigned={afterAssign}
                  onDiscarded={(updated) => {
                    setPage(updated)
                    onChanged()
                  }}
                  onCancel={reassign ? () => setReassign(false) : undefined}
                />
              )}
            </Box>
          </Box>
        )}
      </Box>

      <ConfirmDialog
        open={discardOpen}
        title="Discard this page?"
        message={
          page?.studentName
            ? `The result for ${page.studentName} on ${page.testTitle ?? 'this test'} will be deleted. The page moves to Discarded and can be assigned again later.`
            : 'The page moves to Discarded and can be assigned again later.'
        }
        confirmLabel="Discard"
        destructive
        busy={busy}
        onClose={() => setDiscardOpen(false)}
        onConfirm={discard}
      />
    </Drawer>
  )
}
