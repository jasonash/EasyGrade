import type { JSX, ReactNode } from 'react'
import { Box, IconButton, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

interface Props {
  title?: string
  /** Replaces the title text, for a page whose title is editable (the test editor). */
  titleSlot?: ReactNode
  subtitle?: ReactNode
  /** Small chips shown after the title on the same line (school year, Archived, Finalized). */
  chips?: ReactNode
  /** Renders a back arrow before the title. */
  onBack?: () => void
  backLabel?: string
  actions?: ReactNode
}

/**
 * The one header every page uses: optional back arrow, title with chips,
 * subtitle, and right-aligned actions that wrap under the title on narrow
 * windows. Keeping it in one place keeps the baseline, spacing and action
 * alignment identical across the app.
 */
export function PageHeader({ title, titleSlot, subtitle, chips, onBack, backLabel = 'Back', actions }: Props): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
      {onBack ? (
        <IconButton onClick={onBack} aria-label={backLabel} edge="start">
          <ArrowBackIcon />
        </IconButton>
      ) : null}
      <Box sx={{ flexGrow: 1, minWidth: 240 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          {titleSlot ?? (
            <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
          )}
          {chips}
        </Stack>
        {subtitle ? (
          <Typography variant="body2" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ? (
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
          {actions}
        </Stack>
      ) : null}
    </Stack>
  )
}
