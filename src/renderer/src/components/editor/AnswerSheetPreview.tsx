import type { JSX } from 'react'
import { useTheme } from '@mui/material'
import {
  AS_COLUMN_GAP,
  AS_GRID_LEFT,
  AS_GRID_TOP,
  AS_NUMBER_FONT_SIZE,
  AS_NUMBER_GUTTER,
  BUBBLE_LABEL_FONT_SIZE,
  BUBBLE_LABEL_GRAY,
  GRID_BOTTOM,
  bubbleCenter,
  choiceLabel,
  type HeaderMeasure,
  type SheetLayout
} from '@shared/layout'
import type { LabelStyle } from '@shared/types'
import { PREVIEW_ASCENT as ASCENT, PREVIEW_FONT as FONT, PREVIEW_INK as INK, SheetFrame } from './SheetFrame'

const RULE = '#999'

interface Props {
  sectionName: string
  code: string
  header: HeaderMeasure
  /** The grid to draw, or null when the rows do not fit (the editor explains why). */
  layout: SheetLayout | null
  labelStyles: LabelStyle[]
  /** Correct choice per row, drawn as a filled bubble so the teacher sees the key on the sheet. */
  answerKey: number[]
  /** Row to highlight (the one being edited), if any. */
  highlight?: number | null
}

/** Answer-sheet-only test: the numbered bubble grid exactly as PdfService draws it, with the key shaded in. */
export function AnswerSheetPreview({ sectionName, code, header, layout, labelStyles, answerKey, highlight = null }: Props): JSX.Element {
  const theme = useTheme()
  const cells = layout?.cells ?? []
  const columns = cells.reduce((max, cell) => Math.max(max, cell.column), -1) + 1
  const columnWidth = cells[0]?.width ?? 0
  return (
    <SheetFrame sectionName={sectionName} code={code} header={header} ariaLabel="Answer sheet preview">
      {layout
        ? cells.map((cell, i) => {
            const count = layout.choiceCounts[i] ?? 0
            const style = labelStyles[i] ?? 'letters'
            const key = answerKey[i] ?? null
            const next = cells[i + 1]
            return (
              <g key={i}>
                {highlight === i ? (
                  <rect x={cell.left - 2} y={cell.top} width={cell.width + 4} height={cell.height} fill={theme.palette.primary.main} opacity={0.15} rx={3} />
                ) : null}
                <text x={cell.left + AS_NUMBER_GUTTER - 6} y={cell.y + (AS_NUMBER_FONT_SIZE * ASCENT) / 2} fontFamily={FONT} fontSize={AS_NUMBER_FONT_SIZE} fontWeight={700} fill={INK} textAnchor="end">
                  {i + 1}.
                </text>
                {Array.from({ length: count }, (_, c) => {
                  const center = bubbleCenter(layout, i, c)
                  if (!center) return null
                  const [x, y] = center
                  const isKey = key === c
                  return (
                    <g key={c}>
                      <circle cx={x} cy={y} r={layout.bubbleRadius} fill={isKey ? theme.palette.primary.main : 'none'} fillOpacity={isKey ? 0.3 : 1} stroke={INK} strokeWidth={0.75} />
                      <text x={x} y={y + (BUBBLE_LABEL_FONT_SIZE * ASCENT) / 2} fontFamily={FONT} fontSize={BUBBLE_LABEL_FONT_SIZE} fill={BUBBLE_LABEL_GRAY} textAnchor="middle">
                        {choiceLabel(c, style)}
                      </text>
                    </g>
                  )
                })}
                {cell.row % 5 === 4 && next && next.column === cell.column ? (
                  <line x1={cell.left} y1={cell.top + cell.height} x2={cell.left + cell.width} y2={cell.top + cell.height} stroke={RULE} strokeWidth={0.25} />
                ) : null}
              </g>
            )
          })
        : null}
      {Array.from({ length: Math.max(0, columns - 1) }, (_, k) => {
        const x = AS_GRID_LEFT + (k + 1) * (columnWidth + AS_COLUMN_GAP) - AS_COLUMN_GAP / 2
        return <line key={k} x1={x} y1={AS_GRID_TOP} x2={x} y2={GRID_BOTTOM} stroke={RULE} strokeWidth={0.25} />
      })}
    </SheetFrame>
  )
}
