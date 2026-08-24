import type { JSX } from 'react'
import type { ReactNode } from 'react'
import { Box, Paper, Typography } from '@mui/material'

interface Props {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: Props): JSX.Element {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed', bgcolor: 'transparent' }}
    >
      <Typography variant="h6" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: action ? 3 : 0 }}>
          {description}
        </Typography>
      ) : null}
      {action ? <Box>{action}</Box> : null}
    </Paper>
  )
}