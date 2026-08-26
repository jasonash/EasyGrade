import type { JSX } from 'react'
import { Tooltip } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'

/**
 * The Reviewed cell: a green check when nothing needs a person (clean read or already looked at),
 * an amber mark when the result is still waiting for a look.
 */
export function ReviewedMark({ reviewed }: { reviewed: boolean }): JSX.Element {
  return reviewed ? (
    <Tooltip title="Reviewed">
      <CheckCircleIcon fontSize="small" color="success" />
    </Tooltip>
  ) : (
    <Tooltip title="Not reviewed yet">
      <ErrorOutlineIcon fontSize="small" color="warning" />
    </Tooltip>
  )
}
