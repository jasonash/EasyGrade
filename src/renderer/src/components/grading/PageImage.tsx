import type { JSX } from 'react'
import { useState } from 'react'
import { Box, Dialog, DialogContent, IconButton, Tooltip, useTheme } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { ScanPageDetail } from '@shared/types'
import type { SheetLayout } from '@shared/layout'
import { PAGE_HEIGHT, PAGE_WIDTH } from '@shared/layout'
import { scanImageUrl } from '@shared/scan-url'
import { canReadBubbles } from '@/lib/grading'

interface Props {
  page: ScanPageDetail
  /** Layout the bubbles were read with; overlay is drawn only when the image is the canonical page. */
  layout: SheetLayout | null
  /** Final answer per question to ring on the page. */
  answers: (number | null)[] | null
  /** Correct choice per question; wrong answers also ring the key. */
  answerKey: number[] | null
  /** Questions whose row needs attention (blank, multiple, faint). */
  flagged?: ReadonlySet<number>
}

/**
 * The stored page image with an SVG overlay marking what was read: green
 * ring on a correct answer, red ring on a wrong one (with the key dashed in
 * green), amber box around a row the teacher should look at. Click to zoom.
 */
export function PageImage({ page, layout, answers, answerKey, flagged }: Props): JSX.Element {
  const [zoom, setZoom] = useState(false)
  const src = scanImageUrl(page.imagePath, page.processedAt)
  const overlay = layout && canReadBubbles(page) ? <Overlay layout={layout} answers={answers} answerKey={answerKey} flagged={flagged} /> : null

  return (
    <>
      <Tooltip title="Click to enlarge" placement="top">
        <Box
          onClick={() => setZoom(true)}
          sx={{
            position: 'relative',
            cursor: 'zoom-in',
            lineHeight: 0,
            borderRadius: 1,
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
            bgcolor: '#fff'
          }}
        >
          <img src={src} alt={`Page ${page.pageIndex + 1}`} style={{ width: '100%', height: 'auto', display: 'block' }} />
          {overlay}
        </Box>
      </Tooltip>

      <Dialog open={zoom} onClose={() => setZoom(false)} maxWidth="lg" fullWidth>
        <IconButton onClick={() => setZoom(false)} aria-label="Close" sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, bgcolor: 'background.paper' }}>
          <CloseIcon />
        </IconButton>
        <DialogContent sx={{ p: 1 }}>
          <Box sx={{ position: 'relative', lineHeight: 0, bgcolor: '#fff' }}>
            <img src={src} alt={`Page ${page.pageIndex + 1} enlarged`} style={{ width: '100%', height: 'auto', display: 'block' }} />
            {overlay}
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Overlay({
  layout,
  answers,
  answerKey,
  flagged
}: {
  layout: SheetLayout
  answers: (number | null)[] | null
  answerKey: number[] | null
  flagged: ReadonlySet<number> | undefined
}): JSX.Element {
  const theme = useTheme()
  const r = layout.bubbleRadius
  const marks: JSX.Element[] = []
  for (let q = 0; q < layout.questionCount; q++) {
    const cy = layout.rowY[q]
    const count = layout.choiceCounts[q] ?? 0
    if (cy === undefined || count === 0) continue
    const final = answers?.[q] ?? null
    const key = answerKey?.[q] ?? null
    if (flagged?.has(q)) {
      const x0 = layout.bubbleX[0] ?? 0
      const x1 = layout.bubbleX[count - 1] ?? x0
      marks.push(
        <rect
          key={`flag-${q}`}
          x={x0 - r - 3}
          y={cy - r - 3}
          width={x1 - x0 + 2 * r + 6}
          height={2 * r + 6}
          rx={r}
          fill="none"
          stroke={theme.palette.warning.main}
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
      )
    }
    if (final !== null) {
      const cx = layout.bubbleX[final]
      if (cx !== undefined) {
        const correct = key !== null && final === key
        marks.push(
          <circle key={`final-${q}`} cx={cx} cy={cy} r={r + 2.5} fill="none" stroke={correct ? theme.palette.success.main : theme.palette.error.main} strokeWidth={2} />
        )
      }
    }
    if (key !== null && final !== key) {
      const cx = layout.bubbleX[key]
      if (cx !== undefined) {
        marks.push(
          <circle key={`key-${q}`} cx={cx} cy={cy} r={r + 2.5} fill="none" stroke={theme.palette.success.main} strokeWidth={1.5} strokeDasharray="2.5 2" />
        )
      }
    }
  }
  return (
    <svg viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {marks}
    </svg>
  )
}
