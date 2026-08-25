import type { JSX } from 'react'
import { Box, LinearProgress, Tooltip, Typography } from '@mui/material'
import type { TestMeasure } from '@shared/layout'

interface Props {
  measure: TestMeasure
}

export function FitMeter({ measure }: Props): JSX.Element {
  const percent = Math.round(measure.usage * 100)
  const color = !measure.fits ? 'error' : measure.usage > 0.9 ? 'warning' : 'success'
  const label = !measure.fits
    ? measure.problems[0] ?? 'A question overflows its slot'
    : `Tightest question uses ${percent}% of its slot`
  return (
    <Tooltip title={label}>
      <Box sx={{ minWidth: 180 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Fit
          </Typography>
          <Typography variant="caption" color={`${color}.main`} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {measure.fits ? `${percent}%` : 'Overflow'}
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={Math.min(100, percent)} color={color} sx={{ height: 6, borderRadius: 3 }} />
      </Box>
    </Tooltip>
  )
}
