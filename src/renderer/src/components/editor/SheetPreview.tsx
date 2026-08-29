import type { JSX } from 'react'
import { useTheme } from '@mui/material'
import {
  BUBBLE_LABEL_FONT_SIZE,
  BUBBLE_LABEL_GRAY,
  BUBBLE_RADIUS,
  BUBBLE_X,
  BUBBLE_Y_OFFSET,
  CHOICE_COLUMN_GAP,
  CHOICE_LABEL_GUTTER,
  CHOICE_LETTERS,
  GRID_BOTTOM,
  GRID_TOP,
  NUMBER_GUTTER,
  PAGE_WIDTH,
  SLOT_PADDING,
  STEM_CHOICE_GAP,
  STEM_WIDTH,
  TEXT_COL_X,
  lineHeight,
  type TestMeasure
} from '@shared/layout'
import { PREVIEW_ASCENT as ASCENT, PREVIEW_FONT as FONT, PREVIEW_INK as INK, SheetFrame } from './SheetFrame'

interface Props {
  title: string
  sectionName: string
  code: string
  measure: TestMeasure
  choiceCounts: number[]
}

/** Standard test: questions and choices printed in the slots, bubbles in the right-hand strip. */
export function SheetPreview({ sectionName, code, measure, choiceCounts }: Props): JSX.Element {
  const theme = useTheme()
  const { slotHeight, fontSize } = measure
  const lh = lineHeight(fontSize)
  const overflowFill = theme.palette.error.main

  return (
    <SheetFrame sectionName={sectionName} code={code} header={measure} ariaLabel="Sheet preview">
      {measure.questions.map((q, i) => {
        const top = GRID_TOP + i * slotHeight
        if (top >= GRID_BOTTOM) return null
        const clipId = `slot-clip-${i}`
        const columns = q.columns
        const cellWidth = (STEM_WIDTH - CHOICE_COLUMN_GAP * (columns - 1)) / columns
        const stemX = TEXT_COL_X + NUMBER_GUTTER
        const firstBaseline = top + SLOT_PADDING + fontSize * ASCENT
        const stemRows = Math.max(1, q.stemLines.length)
        const choiceTop = firstBaseline + stemRows * lh + STEM_CHOICE_GAP
        const count = choiceCounts[i] ?? 0
        return (
          <g key={i}>
            <clipPath id={clipId}>
              <rect x={0} y={top} width={PAGE_WIDTH} height={slotHeight} />
            </clipPath>
            {!q.fits ? (
              <rect x={TEXT_COL_X - 4} y={top} width={PAGE_WIDTH - 2 * TEXT_COL_X + 33} height={slotHeight} fill={overflowFill} opacity={0.12} stroke={overflowFill} strokeWidth={1} />
            ) : null}
            <g clipPath={`url(#${clipId})`}>
              <text x={TEXT_COL_X} y={firstBaseline} fontFamily={FONT} fontSize={fontSize} fontWeight={700} fill={INK}>
                {i + 1}.
              </text>
              {q.stemLines.map((line, k) => (
                <text key={k} x={stemX} y={firstBaseline + k * lh} fontFamily={FONT} fontSize={fontSize} fill={INK}>
                  {line}
                </text>
              ))}
              {q.choiceCells.map((cell) => {
                const x = stemX + cell.column * (cellWidth + CHOICE_COLUMN_GAP)
                const y = choiceTop + cell.row * lh
                return (
                  <g key={cell.letter}>
                    <text x={x} y={y} fontFamily={FONT} fontSize={fontSize} fill={INK}>
                      {cell.letter}.
                    </text>
                    {(cell.lines.length > 0 ? cell.lines : ['']).map((line, k) => (
                      <text key={k} x={x + CHOICE_LABEL_GUTTER} y={y + k * lh} fontFamily={FONT} fontSize={fontSize} fill={INK}>
                        {line}
                      </text>
                    ))}
                  </g>
                )
              })}
            </g>
            {BUBBLE_X.slice(0, count).map((x, c) => (
              <g key={x}>
                <circle cx={x} cy={top + BUBBLE_Y_OFFSET} r={BUBBLE_RADIUS} fill="none" stroke={INK} strokeWidth={0.75} />
                <text x={x} y={top + BUBBLE_Y_OFFSET + (BUBBLE_LABEL_FONT_SIZE * ASCENT) / 2} fontFamily={FONT} fontSize={BUBBLE_LABEL_FONT_SIZE} fill={BUBBLE_LABEL_GRAY} textAnchor="middle">
                  {CHOICE_LETTERS[c]}
                </text>
              </g>
            ))}
            <line x1={TEXT_COL_X} y1={top + slotHeight} x2={PAGE_WIDTH - TEXT_COL_X + 25} y2={top + slotHeight} stroke={INK} strokeWidth={0.25} opacity={0.6} />
          </g>
        )
      })}
    </SheetFrame>
  )
}
