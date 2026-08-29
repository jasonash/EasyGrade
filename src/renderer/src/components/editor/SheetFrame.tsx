import type { JSX, ReactNode } from 'react'
import { Box } from '@mui/material'
import {
  BOX_LABEL_FONT_SIZE,
  GRID_TOP,
  INSTRUCTIONS_BASELINE_Y,
  INSTRUCTIONS_FONT_SIZE,
  INSTRUCTIONS_X,
  META_BASELINE_Y,
  META_FONT_SIZE,
  NAME_BOX,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  QR_CODE_FONT_SIZE,
  QR_CODE_TEXT_Y,
  QR_SIZE,
  QR_X,
  QR_Y,
  REG_MARK_CENTERS,
  REG_MARK_SIZE,
  SECTION_BOX,
  TEXT_COL_X,
  TITLE_BASELINE_Y,
  TITLE_FONT_SIZE,
  TITLE_X,
  lineHeight,
  type HeaderMeasure
} from '@shared/layout'

/** Helvetica ascender as a fraction of the font size; pdfkit places baselines this far below the line top. */
export const PREVIEW_ASCENT = 0.718
export const PREVIEW_FONT = 'Helvetica, Arial, sans-serif'
const MONO = 'Courier, "Courier New", monospace'
export const PREVIEW_INK = '#111'
const MUTED = '#666'

interface Props {
  sectionName: string
  code: string
  header: HeaderMeasure
  ariaLabel: string
  children: ReactNode
}

/**
 * Everything on a sheet except the question area: registration marks,
 * header, QR placeholder, name and section boxes, instructions, and the
 * rule at the top of the grid. Both sheet kinds draw their grid inside it.
 */
export function SheetFrame({ sectionName, code, header, ariaLabel, children }: Props): JSX.Element {
  return (
    <Box
      component="svg"
      viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
      sx={{ width: '100%', height: 'auto', display: 'block', bgcolor: '#fff', borderRadius: 1, boxShadow: 3 }}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Registration marks: three squares and a circle bottom right. */}
      {(['topLeft', 'topRight', 'bottomLeft'] as const).map((k) => {
        const [cx, cy] = REG_MARK_CENTERS[k]
        return <rect key={k} x={cx - REG_MARK_SIZE / 2} y={cy - REG_MARK_SIZE / 2} width={REG_MARK_SIZE} height={REG_MARK_SIZE} fill={PREVIEW_INK} />
      })}
      <circle cx={REG_MARK_CENTERS.bottomRight[0]} cy={REG_MARK_CENTERS.bottomRight[1]} r={REG_MARK_SIZE / 2} fill={PREVIEW_INK} />

      {/* Header */}
      {header.titleLines.map((line, i) => (
        <text key={i} x={TITLE_X} y={TITLE_BASELINE_Y + i * lineHeight(TITLE_FONT_SIZE)} fontFamily={PREVIEW_FONT} fontSize={TITLE_FONT_SIZE} fontWeight={700} fill={PREVIEW_INK}>
          {line}
        </text>
      ))}
      <text x={TITLE_X} y={META_BASELINE_Y} fontFamily={PREVIEW_FONT} fontSize={META_FONT_SIZE} fill={PREVIEW_INK}>
        {sectionName}
      </text>
      <text x={TITLE_X + 250} y={META_BASELINE_Y} fontFamily={PREVIEW_FONT} fontSize={META_FONT_SIZE} fill={PREVIEW_INK}>
        Date: ____________
      </text>

      {/* QR placeholder and human-readable code */}
      <rect x={QR_X} y={QR_Y} width={QR_SIZE} height={QR_SIZE} fill="none" stroke={PREVIEW_INK} strokeWidth={1} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}-${c}`} x={QR_X + 8 + c * 30} y={QR_Y + 8 + r * 30} width={(r + c) % 2 === 0 ? 14 : 8} height={(r + c) % 2 === 0 ? 14 : 8} fill={PREVIEW_INK} opacity={0.35} />
        ))
      )}
      <text x={QR_X + QR_SIZE / 2} y={QR_CODE_TEXT_Y + QR_CODE_FONT_SIZE * PREVIEW_ASCENT} fontFamily={MONO} fontSize={QR_CODE_FONT_SIZE} fill={PREVIEW_INK} textAnchor="middle">
        {code}
      </text>

      {/* Name and section boxes (blank-sheet variant) */}
      {[
        { box: NAME_BOX, label: 'Name' },
        { box: SECTION_BOX, label: 'Section' }
      ].map(({ box, label }) => (
        <g key={label}>
          <rect x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} fill="none" stroke={PREVIEW_INK} strokeWidth={0.75} />
          <text x={box[0] + 3} y={box[1] + BOX_LABEL_FONT_SIZE + 2} fontFamily={PREVIEW_FONT} fontSize={BOX_LABEL_FONT_SIZE} fill={MUTED}>
            {label}
          </text>
        </g>
      ))}

      {/* Instructions and the rule at the top of the grid */}
      {header.instructionLines.map((line, i) => (
        <text key={i} x={INSTRUCTIONS_X} y={INSTRUCTIONS_BASELINE_Y + i * lineHeight(INSTRUCTIONS_FONT_SIZE)} fontFamily={PREVIEW_FONT} fontSize={INSTRUCTIONS_FONT_SIZE} fontStyle="italic" fill={PREVIEW_INK}>
          {line}
        </text>
      ))}
      <line x1={TEXT_COL_X} y1={GRID_TOP} x2={PAGE_WIDTH - TEXT_COL_X + 25} y2={GRID_TOP} stroke={PREVIEW_INK} strokeWidth={0.5} />

      {children}
    </Box>
  )
}
