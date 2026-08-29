import type { JSX, KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Drawer, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import AssessmentIcon from '@mui/icons-material/Assessment'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type { ScanPageDetail, Test } from '@shared/types'
import { api, unwrap } from '@/api'
import { useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { gradingApi } from '@/lib/grading-api'
import { describeError } from '@/lib/errors'
import { BUCKETS, formatPercent, percentOf } from '@/lib/grading'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Code } from '@/components/common/Code'
import { LinkButton } from '@/components/common/LinkButton'
import { AnswerRows } from './AnswerRows'
import { AssignPanel } from './AssignPanel'
import { PageImage } from './PageImage'

interface Props {
  pageId: number | null
  /**
   * The pages the drawer can step through, in list order. With this and
   * `onNavigate`, the header gets Previous / Next (also the arrow keys) and
   * finishing a page moves on to the next one instead of staying put.
   */
  pageIds?: number[]
  /**
   * The pages in `pageIds` whose result still needs a review. "Mark reviewed,
   * next" moves to the next of these (wrapping around) rather than to
   * whatever page happens to follow, and says so when none are left.
   */
  toReviewIds?: number[]
  onNavigate?: (pageId: number) => void
  onClose: () => void
  /** Anything changed (override, assignment, discard); lists behind the drawer should refresh. */
  onChanged: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * Right-hand drawer for one scanned page. Graded pages show the answer rows
 * with override controls; everything else shows the assignment panel.
 */
export function PageReviewDrawer({ pageId, pageIds, toReviewIds, onNavigate, onClose, onChanged }: Props): JSX.Element {
  const getPage = useScanStore((s) => s.getPage)
  const discardPage = useScanStore((s) => s.discardPage)
  const toast = useUiStore((s) => s.toast)
  const uiPage = useUiStore((s) => s.page)
  const openTestResults = useUiStore((s) => s.openTestResults)
  const openStudentResults = useUiStore((s) => s.openStudentResults)

  const [page, setPage] = useState<ScanPageDetail | null>(null)
  const [test, setTest] = useState<Test | null>(null)
  const [loading, setLoading] = useState(false)
  const [reassign, setReassign] = useState(false)
  const [busyQ, setBusyQ] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  /** Set when "Mark reviewed" just finished the last page that needed a review. */
  const [finishedReviewing, setFinishedReviewing] = useState(false)

  const load = useCallback(
    async (id: number): Promise<void> => {
      const loaded = await getPage(id)
      setPage(loaded)
      if (loaded.testId !== null) {
        // Without the test there is no answer key to show, but the page itself can still be assigned or discarded.
        setTest(
          await unwrap(api.tests.get(loaded.testId)).catch((err: unknown) => {
            toast('error', `Could not load the test for this page: ${describeError(err)}`)
            return null
          })
        )
      } else {
        setTest(null)
      }
    },
    [getPage, toast]
  )

  // Parents pass `onClose` inline, so its identity changes whenever they
  // re-render (which `onChanged` makes them do after every override). The
  // load effect must not depend on it: reloading replaces the answer rows
  // with the skeleton and throws the teacher back to the top of the list.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

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
    setFinishedReviewing(false)
    void load(pageId)
      .catch((err: unknown) => {
        if (!cancelled) {
          toast('error', describeError(err))
          onCloseRef.current()
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pageId, load, toast])

  // Position in the list, when there is one.
  const index = pageId !== null && pageIds ? pageIds.indexOf(pageId) : -1
  const prevId = index > 0 ? (pageIds?.[index - 1] ?? null) : null
  const nextId = pageIds && index >= 0 && index < pageIds.length - 1 ? (pageIds[index + 1] ?? null) : null
  const canStep = pageIds !== undefined && onNavigate !== undefined && index >= 0

  /**
   * The next page after this one that still needs a review, wrapping around
   * to the start of the list, so it does not matter which flagged page the
   * teacher opened first. Null when this is the last one.
   */
  const nextReviewId = useMemo((): number | null => {
    if (!canStep || !pageIds || !toReviewIds) return null
    const pending = new Set(toReviewIds)
    for (let step = 1; step < pageIds.length; step++) {
      const candidate = pageIds[(index + step) % pageIds.length]
      if (candidate !== undefined && candidate !== pageId && pending.has(candidate)) return candidate
    }
    return null
  }, [canStep, pageIds, toReviewIds, index, pageId])

  /**
   * After a page is finished (assigned, resolved, discarded, marked reviewed)
   * move to the next one in the list; on the last page close the drawer. The
   * next id is taken before the change so it does not matter that the finished
   * page may drop out of the list once the parent refreshes.
   */
  const advanceFrom = (next: number | null): void => {
    if (!canStep) return
    if (next !== null && onNavigate) onNavigate(next)
    else onClose()
  }

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
    const next = nextReviewId
    const marking = !result.reviewed
    setBusy(true)
    void gradingApi
      .setReviewed({ resultId: result.id, reviewed: marking })
      .then((updated) => {
        setPage((prev) => (prev ? { ...prev, result: updated } : prev))
        onChanged()
        if (!marking) {
          setFinishedReviewing(false)
        } else if (next !== null && onNavigate) {
          onNavigate(next)
        } else {
          // Nothing else needs a look: say so instead of silently closing or
          // stepping to a page that was already reviewed.
          setFinishedReviewing(canStep)
        }
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(false))
  }

  const discard = (): void => {
    if (!page) return
    const next = nextId
    setBusy(true)
    void discardPage(page.id)
      .then((updated) => {
        setDiscardOpen(false)
        setPage(updated)
        toast('info', 'Page discarded')
        onChanged()
        advanceFrom(next)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(false))
  }

  const afterAssign = (updated: ScanPageDetail): void => {
    const next = nextId
    setReassign(false)
    onChanged()
    if (canStep) {
      advanceFrom(next)
      return
    }
    void load(updated.id).catch((err: unknown) => toast('error', describeError(err)))
  }

  const afterDiscardFromPanel = (updated: ScanPageDetail): void => {
    const next = nextId
    setPage(updated)
    onChanged()
    advanceFrom(next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!canStep || isTypingTarget(event.target)) return
    if (event.key === 'ArrowRight' && nextId !== null && onNavigate) {
      event.preventDefault()
      onNavigate(nextId)
    } else if (event.key === 'ArrowLeft' && prevId !== null && onNavigate) {
      event.preventDefault()
      onNavigate(prevId)
    }
  }

  const bucketMeta = page ? BUCKETS.find((b) => b.key === page.bucket) : undefined
  const score = result ? `${result.correctCount}/${result.possibleCount}` : null
  const percent = result ? formatPercent(percentOf(result.correctCount, result.possibleCount)) : ''
  const showResultsLink = page?.bucket === 'graded' && page.testId !== null && uiPage !== 'test-results'

  return (
    <Drawer
      anchor="right"
      open={pageId !== null}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      slotProps={{ paper: { sx: { width: { xs: '100vw', md: 940 }, maxWidth: '100vw' }, onKeyDown } }}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap role="status" aria-live="polite">
              {page ? `Page ${page.pageIndex + 1}` : 'Page'}
              {page?.studentName ? (
                <>
                  {' · '}
                  {page.studentId !== null && uiPage !== 'student-results' ? (
                    <LinkButton variant="inherit" onClick={() => page.studentId !== null && openStudentResults(page.studentId)}>
                      {page.studentName}
                    </LinkButton>
                  ) : (
                    page.studentName
                  )}
                </>
              ) : null}
              {score ? ` · ${score} (${percent})` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {page?.testTitle ?? (page ? 'No test identified' : '')}
              {page?.sectionName ? ` · ${page.sectionName}` : ''}
            </Typography>
          </Box>
          {showResultsLink && page ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AssessmentIcon />}
              onClick={() => {
                if (page.testId !== null) openTestResults(page.testId)
              }}
              sx={{ whiteSpace: 'nowrap', mt: 0.5 }}
            >
              Class results
            </Button>
          ) : null}
          {canStep && pageIds ? (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
              <Tooltip title="Previous page (left arrow)">
                <span>
                  <IconButton onClick={() => prevId !== null && onNavigate?.(prevId)} disabled={prevId === null} aria-label="Previous page">
                    <NavigateBeforeIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {index + 1} of {pageIds.length}
              </Typography>
              <Tooltip title="Next page (right arrow)">
                <span>
                  <IconButton onClick={() => nextId !== null && onNavigate?.(nextId)} disabled={nextId === null} aria-label="Next page">
                    <NavigateNextIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          ) : null}
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
                  {/* Same order as the assign footer (destructive text, secondary, primary) and pinned so a long sheet never scrolls it away. */}
                  <Box sx={{ position: 'sticky', bottom: 0, mt: 2, py: 1.5, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
                    {finishedReviewing && result.reviewed ? (
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                        <CheckCircleIcon color="success" fontSize="small" />
                        <Typography variant="body2" sx={{ flexGrow: 1 }} role="status" aria-live="polite">
                          That was the last one: every page in this list is reviewed.
                        </Typography>
                        <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={onClose} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                          Back to list
                        </Button>
                      </Stack>
                    ) : null}
                    <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                      <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDiscardOpen(true)} disabled={busy}>
                        Discard
                      </Button>
                      <Button variant="outlined" startIcon={<SwapHorizIcon />} onClick={() => setReassign(true)} disabled={busy}>
                        Reassign
                      </Button>
                      <Button
                        variant={result.reviewed ? 'outlined' : 'contained'}
                        color={result.reviewed ? 'success' : 'primary'}
                        startIcon={result.reviewed ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
                        onClick={toggleReviewed}
                        disabled={busy}
                      >
                        {result.reviewed ? 'Reviewed' : nextReviewId !== null ? 'Mark reviewed, next' : 'Mark reviewed'}
                      </Button>
                    </Stack>
                  </Box>
                </>
              ) : (
                <AssignPanel
                  key={`${page.id}-${reassign ? 'reassign' : page.bucket ?? ''}`}
                  page={page}
                  reassign={reassign}
                  onAssigned={afterAssign}
                  onDiscarded={afterDiscardFromPanel}
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
