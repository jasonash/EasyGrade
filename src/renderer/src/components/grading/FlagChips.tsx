import type { JSX, ReactNode } from 'react'
import { Chip, Stack, Tooltip } from '@mui/material'
import type { QuestionFlag } from '@shared/types'
import { flagLabel } from '@/lib/grading'

interface Props {
  flags: QuestionFlag[]
  /** Chips shown before the rest collapse into "+N more". */
  max?: number
  /** Extra chips after the flags (edited count, weak alignment). */
  extra?: ReactNode
}

/**
 * Flag chips for a table cell. A sheet with every row blank would otherwise
 * produce ten chips and a row three lines tall; the review drawer shows every
 * flag, so the table only needs the first few and a count.
 */
export function FlagChips({ flags, max = 3, extra }: Props): JSX.Element | null {
  if (flags.length === 0 && !extra) return null
  const shown = flags.slice(0, max)
  const rest = flags.slice(max)
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
      {shown.map((f) => (
        <Chip key={`${f.q}-${f.kind}`} size="small" color="warning" variant="outlined" label={flagLabel(f)} />
      ))}
      {rest.length > 0 ? (
        <Tooltip title={rest.map(flagLabel).join(', ')}>
          <Chip size="small" variant="outlined" label={`+${rest.length} more`} />
        </Tooltip>
      ) : null}
      {extra}
    </Stack>
  )
}
