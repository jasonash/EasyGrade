import type { JSX } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import PrintIcon from '@mui/icons-material/Print'
import RefreshIcon from '@mui/icons-material/Refresh'
import type { TestResults } from '@shared/types'
import { useUiStore } from '@/stores/ui.store'
import { useTestsStore } from '@/stores/tests.store'
import { api, unwrap } from '@/api'
import { gradingApi } from '@/lib/grading-api'
import { describeError } from '@/lib/errors'
import { choiceLetter, flagLabel, formatPercent, percentOf } from '@/lib/grading'
import { EmptyState } from '@/components/common/EmptyState'
import { PageReviewDrawer } from '@/components/grading/PageReviewDrawer'
import { PrintDialog } from '@/components/print/PrintDialog'

/** Results for one test: score table with a column per question, per-question rates, missing students. */
export function TestResultsPage(): JSX.Element {
  const testId = useUiStore((s) => s.resultsTestId)
  const closeResults = useUiStore((s) => s.closeResults)
  const openTest = useUiStore((s) => s.openTest)
  const toast = useUiStore((s) => s.toast)
  const reloadTests = useTestsStore((s) => s.load)

  const [view, setView] = useState<TestResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (testId === null) return
    setView(await gradingApi.resultsForTest(testId))
  }, [testId])

  useEffect(() => {
    setLoading(true)
    void load()
      .catch((err: unknown) => {
        toast('error', describeError(err))
        closeResults()
      })
      .finally(() => setLoading(false))
  }, [load, toast, closeResults])

  const refresh = (): void => {
    void load().catch((err: unknown) => toast('error', describeError(err)))
  }

  const exportCsv = (): void => {
    if (testId === null) return
    setBusy(true)
    void unwrap(api.export.testCsv(testId))
      .then((outcome) => {
        if (outcome) toast('success', `Saved ${outcome.rows} rows to ${outcome.path}`)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(false))
  }

  const regrade = (): void => {
    if (testId === null) return
    setBusy(true)
    void gradingApi
      .regradeTest(testId)
      .then((outcome) => {
        toast('success', `Regraded ${outcome.count} result${outcome.count === 1 ? '' : 's'}`)
        return load()
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(false))
  }

  if (testId === null) return <Box />
  if (loading || !view) return <Skeleton variant="rounded" height={400} />

  const { test, questions, rows, missing } = view
  const reviewed = rows.filter((r) => r.result.reviewed).length
  const flagged = rows.filter((r) => r.result.flags.length > 0).length

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <IconButton onClick={closeResults} aria-label="Back" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 240 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {test.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {test.sectionName} · Results · layout v{test.layoutVersion}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={busy || rows.length === 0}>
          Export CSV
        </Button>
        <Tooltip title="Rescore every result against the current answer key. Key changes already do this automatically.">
          <span>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={regrade} disabled={busy || rows.length === 0}>
              Regrade
            </Button>
          </span>
        </Tooltip>
        <Button variant="outlined" startIcon={<EditIcon />} onClick={() => openTest(test.id)}>
          Open test
        </Button>
        {missing.length > 0 ? (
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => setPrintOpen(true)}>
            Make-up sheets ({missing.length})
          </Button>
        ) : null}
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <Stat label="Average" value={view.averagePercent === null ? '–' : formatPercent(view.averagePercent)} />
        <Stat label="Graded" value={`${rows.length}/${rows.length + missing.length}`} />
        <Stat label="Reviewed" value={`${reviewed}/${rows.length}`} />
        <Stat label="With flags" value={String(flagged)} />
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No results yet" description="Import scanned answer sheets for this test on the Grading page. Graded pages show up here." />
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell align="right">%</TableCell>
                {questions.map((q) => (
                  <TableCell key={q.position} align="center" sx={{ px: 0.5 }}>
                    <Tooltip title={`Key: ${choiceLetter(q.correctChoice)}`}>
                      <span>Q{q.position + 1}</span>
                    </Tooltip>
                  </TableCell>
                ))}
                <TableCell>Flags</TableCell>
                <TableCell align="center">Reviewed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.result.id} hover onClick={() => row.page && setReviewId(row.page.id)} sx={{ cursor: row.page ? 'pointer' : 'default' }}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {row.student.lastName}, {row.student.firstName}
                    {!row.student.active ? <Chip size="small" label="Inactive" sx={{ ml: 1 }} /> : null}
                  </TableCell>
                  <TableCell align="right">
                    {row.result.correctCount}/{row.result.possibleCount}
                  </TableCell>
                  <TableCell align="right">{formatPercent(percentOf(row.result.correctCount, row.result.possibleCount))}</TableCell>
                  {questions.map((q) => {
                    const answer = row.result.finalAnswers[q.position] ?? null
                    const correct = answer !== null && answer === q.correctChoice
                    const edited = row.result.overrides.some((o) => o.q === q.position)
                    return (
                      <TableCell key={q.position} align="center" sx={{ px: 0.5 }}>
                        <Tooltip title={`${choiceLetter(answer)}${edited ? ' (edited)' : ''}`}>
                          <Typography component="span" variant="body2" sx={{ color: answer === null ? 'text.secondary' : correct ? 'success.main' : 'error.main', fontWeight: edited ? 700 : 400 }}>
                            {answer === null ? '–' : correct ? '✓' : '✗'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {row.result.flags.map((f) => <Chip key={`${f.q}-${f.kind}`} size="small" color="warning" variant="outlined" label={flagLabel(f)} />)}
                    </Stack>
                  </TableCell>
                  <TableCell align="center">{row.result.reviewed ? <CheckCircleIcon fontSize="small" color="success" /> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} sx={{ color: 'text.secondary' }}>
                  Correct per question
                </TableCell>
                {view.perQuestionCorrect.map((rate, q) => (
                  <TableCell key={q} align="center" sx={{ px: 0.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {rate === null ? '' : `${Math.round(100 * rate)}%`}
                  </TableCell>
                ))}
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </Paper>
      )}

      {missing.length > 0 ? (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Missing ({missing.length})
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {missing.map((s) => `${s.lastName}, ${s.firstName}`).join(' · ')}
          </Typography>
        </Box>
      ) : null}

      <PageReviewDrawer pageId={reviewId} onClose={() => setReviewId(null)} onChanged={refresh} />

      <PrintDialog
        open={printOpen}
        test={test}
        initialStudentIds={missing.map((s) => s.id)}
        onClose={() => setPrintOpen(false)}
        onPrinted={() => void reloadTests()}
      />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1, minWidth: 110 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Paper>
  )
}
