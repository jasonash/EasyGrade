import type { JSX } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Box, Chip, IconButton, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { StudentResults } from '@shared/types'
import { useUiStore } from '@/stores/ui.store'
import { gradingApi } from '@/lib/grading-api'
import { describeError } from '@/lib/errors'
import { formatShortDate } from '@/lib/format'
import { flagLabel, formatPercent, percentOf } from '@/lib/grading'
import { EmptyState } from '@/components/common/EmptyState'
import { PageReviewDrawer } from '@/components/grading/PageReviewDrawer'

/** Every graded test for one student, reached from the roster. */
export function StudentResultsPage(): JSX.Element {
  const studentId = useUiStore((s) => s.resultsStudentId)
  const closeResults = useUiStore((s) => s.closeResults)
  const openTestResults = useUiStore((s) => s.openTestResults)
  const toast = useUiStore((s) => s.toast)

  const [view, setView] = useState<StudentResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewId, setReviewId] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (studentId === null) return
    setView(await gradingApi.resultsForStudent(studentId))
  }, [studentId])

  useEffect(() => {
    setLoading(true)
    void load()
      .catch((err: unknown) => {
        toast('error', describeError(err))
        closeResults()
      })
      .finally(() => setLoading(false))
  }, [load, toast, closeResults])

  if (studentId === null) return <Box />
  if (loading || !view) return <Skeleton variant="rounded" height={300} />

  const { student, rows } = view
  const percents = rows.map((r) => percentOf(r.result.correctCount, r.result.possibleCount)).filter((p): p is number => p !== null)
  const average = percents.length > 0 ? percents.reduce((a, b) => a + b, 0) / percents.length : null

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton onClick={closeResults} aria-label="Back" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {student.lastName}, {student.firstName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {student.studentNumber ? `#${student.studentNumber} · ` : ''}
            {rows.length} graded test{rows.length === 1 ? '' : 's'}
            {average !== null ? ` · average ${formatPercent(average)}` : ''}
          </Typography>
        </Box>
        {!student.active ? <Chip size="small" label="Inactive" /> : null}
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No results yet" description="Graded answer sheets for this student will be listed here." />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Test</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell align="right">%</TableCell>
                <TableCell>Graded</TableCell>
                <TableCell>Flags</TableCell>
                <TableCell align="center">Reviewed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.result.id} hover onClick={() => row.page && setReviewId(row.page.id)} sx={{ cursor: row.page ? 'pointer' : 'default' }}>
                  <TableCell>
                    <Typography
                      component="button"
                      variant="body2"
                      onClick={(e) => {
                        e.stopPropagation()
                        openTestResults(row.test.id)
                      }}
                      sx={{ background: 'none', border: 0, p: 0, color: 'primary.main', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                    >
                      {row.test.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {row.test.sectionName}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {row.result.correctCount}/{row.result.possibleCount}
                  </TableCell>
                  <TableCell align="right">{formatPercent(percentOf(row.result.correctCount, row.result.possibleCount))}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(row.result.gradedAt)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {row.result.flags.map((f) => <Chip key={`${f.q}-${f.kind}`} size="small" color="warning" variant="outlined" label={flagLabel(f)} />)}
                      {row.result.overrides.length > 0 ? <Chip size="small" color="info" variant="outlined" label={`${row.result.overrides.length} edited`} /> : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="center">{row.result.reviewed ? <CheckCircleIcon fontSize="small" color="success" /> : null}</TableCell>
                </TableRow>
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
