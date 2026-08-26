import type { JSX, ReactNode } from 'react'
import { Typography, type SxProps, type Theme } from '@mui/material'

interface Props {
  children: ReactNode
  sx?: SxProps<Theme>
}

/**
 * Inline monospace for student codes and QR payloads. Sized to sit level with
 * the text around it; a generic `monospace` at body size reads noticeably larger.
 */
export function Code({ children, sx }: Props): JSX.Element {
  return (
    <Typography
      component="span"
      sx={[
        { fontFamily: 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace', fontSize: '0.9em', letterSpacing: 0.5 },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {children}
    </Typography>
  )
}
