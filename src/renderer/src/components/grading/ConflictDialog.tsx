import type { JSX } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import type { GradeResult, ScanPageDetail } from '@shared/types'
import { scanImageUrl } from '@shared/scan-url'
import { formatPercent, percentOf } from '@/lib/grading'
import { formatShortDate } from '@/lib/format'

interface Props {
  open: boolean
  studentName: string
  testTitle: string
  existing: GradeResult
  existingPage: ScanPageDetail | null
  page: ScanPageDetail
  /** Detected score on this page when it has been read, for the side-by-side. */
  thisScore: { correct: number; possible: number } | null
  busy: boolean
  onKeep: () => void
  onReplace: () => void
  onCancel: () => void
}

/** Two sheets for one student and test: keep the graded one or replace it with this page. */
export function ConflictDialog({ open, studentName, testTitle, existing, existingPage, page, thisScore, busy, onKeep, onReplace, onCancel }: Props): JSX.Element {
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Already graded</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {studentName} already has a result for {testTitle}. Keep the existing result, or replace it with this page? The page
          that loses is moved to Discarded.
        </Typography>
        <Stack direction="row" spacing={2}>
          <Side
            title="Existing result"
            thumb={existingPage?.thumbPath ?? null}
            version={existingPage?.processedAt ?? null}
            line1={`${existing.correctCount}/${existing.possibleCount} (${formatPercent(percentOf(existing.correctCount, existing.possibleCount))})`}
            line2={`Graded ${formatShortDate(existing.gradedAt)}${existing.overrides.length > 0 ? `, ${existing.overrides.length} edited` : ''}`}
          />
          <Side
            title="This page"
            thumb={page.thumbPath}
            version={page.processedAt}
            line1={thisScore ? `${thisScore.correct}/${thisScore.possible} (${formatPercent(percentOf(thisScore.correct, thisScore.possible))})` : 'Not read yet'}
            line2={`Page ${page.pageIndex + 1} of this batch`}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onKeep} disabled={busy}>
          Keep existing
        </Button>
        <Button variant="contained" color="warning" onClick={onReplace} disabled={busy}>
          Replace with this page
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Side({ title, thumb, version, line1, line2 }: { title: string; thumb: string | null; version: string | null; line1: string; line2: string }): JSX.Element {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Box sx={{ height: 180, bgcolor: '#fff', borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider', display: 'flex', justifyContent: 'center' }}>
        {thumb ? <img src={scanImageUrl(thumb, version)} alt={title} style={{ height: '100%', width: 'auto' }} /> : null}
      </Box>
      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
        {line1}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {line2}
      </Typography>
    </Box>
  )
}
