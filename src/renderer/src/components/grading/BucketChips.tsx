import type { JSX } from 'react'
import { Chip, Stack, Typography } from '@mui/material'
import type { BucketCounts } from '@shared/types'
import { BUCKETS } from '@/lib/grading'

/** Compact "27 graded, 2 need assignment, 1 to review" chips for a batch. */
export function BucketChips({ counts, toReview = 0 }: { counts: BucketCounts; toReview?: number }): JSX.Element {
  const shown = BUCKETS.filter((b) => counts[b.key] > 0)
  if (shown.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No pages
      </Typography>
    )
  }
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {shown.map((b) => (
        <Chip
          key={b.key}
          size="small"
          color={b.color}
          variant={b.color === 'default' ? 'outlined' : 'filled'}
          label={`${counts[b.key]} ${b.countLabel}`}
        />
      ))}
      {toReview > 0 ? <Chip size="small" color="warning" variant="outlined" label={`${toReview} to review`} /> : null}
    </Stack>
  )
}

export function describeCounts(counts: BucketCounts): string {
  return BUCKETS.filter((b) => counts[b.key] > 0)
    .map((b) => `${counts[b.key]} ${b.countLabel}`)
    .join(', ')
}
