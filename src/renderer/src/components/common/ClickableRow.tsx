import type { JSX, KeyboardEvent, ReactNode } from 'react'
import { TableRow, type SxProps, type Theme } from '@mui/material'

interface Props {
  onOpen: () => void
  /** What Enter opens, for screen readers ("Open results for Alpha, Test"). */
  label?: string
  disabled?: boolean
  children: ReactNode
  sx?: SxProps<Theme>
}

/**
 * A table row that opens something. Keeps table semantics but is reachable
 * with Tab and activates with Enter or Space, so the review drawer and detail
 * pages are not mouse-only. Clicks inside the row's own buttons still work
 * because only key events aimed at the row itself are handled.
 */
export function ClickableRow({ onOpen, label, disabled = false, children, sx }: Props): JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }
  return (
    <TableRow
      hover={!disabled}
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      onClick={disabled ? undefined : onOpen}
      onKeyDown={disabled ? undefined : onKeyDown}
      sx={[{ cursor: disabled ? 'default' : 'pointer' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </TableRow>
  )
}
