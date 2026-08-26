import type { JSX } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Box, Chip, Paper, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { StudentResults } from '@shared/types'
import { useUiStore } from '@/stores/ui.store'
import { gradingApi } from '@/lib/grading-api'
import { describeError } from '@/lib/errors'
import { formatShortDate } from '@/lib/format'
import { formatPercent, percentOf } from '@/lib/grading'
import { EmptyState } from '@/components/common/EmptyState'
import { ClickableRow } from '@/components/common/ClickableRow'
import { LinkButton } from '@/components/common/LinkButton'
import { PageHeader } from '@/components/common/PageHeader'
import { FlagChips } from '@/components/grading/FlagChips'
import { ReviewedMark } from '@/components/grading/ReviewedMark'
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
      <PageHeader
        title={`${student.lastName}, ${student.firstName}`}
        subtitle={`${student.studentNumber ? `#${student.studentNumber} · ` : ''}${rows.length} graded test${rows.length === 1 ? '' : 's'}${
          average !== null ? ` · average ${formatPercent(average)}` : ''
        }`}
        chips={!student.active ? <Chip size="small" label="Inactive" /> : null}
        onBack={closeResults}
      />

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
                <ClickableRow
                  key={row.result.id}
                  onOpen={() => row.page && setReviewId(row.page.id)}
                  disabled={!row.page}
                  label={`Review ${row.test.title}`}
                >
                  <TableCell>
                    <LinkButton onClick={() => openTestResults(row.test.id)}>{row.test.title}</LinkButton>
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
                    <FlagChips
                      flags={row.result.flags}
                      extra={row.result.overrides.length > 0 ? <Chip size="small" color="info" variant="outlined" label={`${row.result.overrides.length} edited`} /> : null}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <ReviewedMark reviewed={row.result.reviewed} />
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <PageReviewDrawer
        pageId={reviewId}
        pageIds={rows.flatMap((r) => (r.page ? [r.page.id] : []))}
        onNavigate={setReviewId}
        onClose={() => setReviewId(null)}
        onChanged={() => {
          void load().catch((err: unknown) => toast('error', describeError(err)))
        }}
      />
    </>
  )
}
