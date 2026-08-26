import type { JSX, ReactNode } from 'react'
import { Link, type SxProps, type Theme } from '@mui/material'

interface Props {
  onClick: () => void
  children: ReactNode
  /** Typography variant; "inherit" inside a heading. */
  variant?: 'body2' | 'inherit'
  sx?: SxProps<Theme>
}

/**
 * Inline text that opens something else (a student's history from a results
 * row, a test from a student's row). Rendered as a button so it is focusable
 * and never a real anchor, and it swallows the click so a clickable row
 * underneath does not also open.
 */
export function LinkButton({ onClick, children, variant = 'body2', sx }: Props): JSX.Element {
  return (
    <Link
      component="button"
      type="button"
      variant={variant}
      underline="hover"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      sx={[{ textAlign: 'left', verticalAlign: 'baseline' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Link>
  )
}
