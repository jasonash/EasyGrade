import type { JSX } from 'react'
import { Box, useTheme } from '@mui/material'
import {
  BOX_LABEL_FONT_SIZE,
  BUBBLE_RADIUS,
  BUBBLE_X,
  BUBBLE_Y_OFFSET,
  CHOICE_COLUMN_GAP,
  CHOICE_LABEL_GUTTER,
  CHOICE_LETTERS,
  GRID_BOTTOM,
  GRID_TOP,
  INSTRUCTIONS_BASELINE_Y,
  INSTRUCTIONS_FONT_SIZE,
  INSTRUCTIONS_X,
  META_BASELINE_Y,
  META_FONT_SIZE,
  NAME_BOX,
  NUMBER_GUTTER,
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
  SLOT_PADDING,
  STEM_CHOICE_GAP,
  STEM_WIDTH,
  BUBBLE_LABEL_FONT_SIZE,
  BUBBLE_LABEL_GRAY,
  TEXT_COL_X,
  TITLE_BASELINE_Y,
  TITLE_FONT_SIZE,
  TITLE_X,
  lineHeight,
  type TestMeasure
} from '@shared/layout'

/** Helvetica ascender as a fraction of the font size; pdfkit places baselines this far below the line top. */
const ASCENT = 0.718
const FONT = 'Helvetica, Arial, sans-serif'
const MONO = 'Courier, "Courier New", monospace'
const INK = '#111'
const MUTED = '#666'

interface Props {
  title: string
  sectionName: string
  code: string
  measure: TestMeasure
  choiceCounts: number[]
}

export function SheetPreview({ sectionName, code, measure, choiceCounts }: Props): JSX.Element {
  const theme = useTheme()
  const { slotHeight, fontSize } = measure
  const lh = lineHeight(fontSize)
  const overflowFill = theme.palette.error.main

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
      sx={{ width: '100%', height: 'auto', display: 'block', bgcolor: '#fff', borderRadius: 1, boxShadow: 3 }}
      role="img"
      aria-label="Sheet preview"
    >
      {/* Registration marks: three squares and a circle bottom right. */}
      {(['topLeft', 'topRight', 'bottomLeft'] as const).map((k) => {
        const [cx, cy] = REG_MARK_CENTERS[k]
        return <rect key={k} x={cx - REG_MARK_SIZE / 2} y={cy - REG_MARK_SIZE / 2} width={REG_MARK_SIZE} height={REG_MARK_SIZE} fill={INK} />
      })}
      <circle cx={REG_MARK_CENTERS.bottomRight[0]} cy={REG_MARK_CENTERS.bottomRight[1]} r={REG_MARK_SIZE / 2} fill={INK} />

      {/* Header */}
      {measure.titleLines.map((line, i) => (
        <text key={i} x={TITLE_X} y={TITLE_BASELINE_Y + i * lineHeight(TITLE_FONT_SIZE)} fontFamily={FONT} fontSize={TITLE_FONT_SIZE} fontWeight={700} fill={INK}>
          {line}
        </text>
      ))}
      <text x={TITLE_X} y={META_BASELINE_Y} fontFamily={FONT} fontSize={META_FONT_SIZE} fill={INK}>
        {sectionName}
      </text>
      <text x={TITLE_X + 250} y={META_BASELINE_Y} fontFamily={FONT} fontSize={META_FONT_SIZE} fill={INK}>
        Date: ____________
      </text>

      {/* QR placeholder and human-readable code */}
      <rect x={QR_X} y={QR_Y} width={QR_SIZE} height={QR_SIZE} fill="none" stroke={INK} strokeWidth={1} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}-${c}`} x={QR_X + 8 + c * 30} y={QR_Y + 8 + r * 30} width={(r + c) % 2 === 0 ? 14 : 8} height={(r + c) % 2 === 0 ? 14 : 8} fill={INK} opacity={0.35} />
        ))
      )}
      <text x={QR_X + QR_SIZE / 2} y={QR_CODE_TEXT_Y + QR_CODE_FONT_SIZE * ASCENT} fontFamily={MONO} fontSize={QR_CODE_FONT_SIZE} fill={INK} textAnchor="middle">
        {code}
      </text>

      {/* Name and section boxes (blank-sheet variant) */}
      {[
        { box: NAME_BOX, label: 'Name' },
        { box: SECTION_BOX, label: 'Section' }
      ].map(({ box, label }) => (
        <g key={label}>
          <rect x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} fill="none" stroke={INK} strokeWidth={0.75} />
          <text x={box[0] + 3} y={box[1] + BOX_LABEL_FONT_SIZE + 2} fontFamily={FONT} fontSize={BOX_LABEL_FONT_SIZE} fill={MUTED}>
            {label}
          </text>
        </g>
      ))}

      {/* Instructions and the A-E strip header */}
      {measure.instructionLines.map((line, i) => (
        <text key={i} x={INSTRUCTIONS_X} y={INSTRUCTIONS_BASELINE_Y + i * lineHeight(INSTRUCTIONS_FONT_SIZE)} fontFamily={FONT} fontSize={INSTRUCTIONS_FONT_SIZE} fontStyle="italic" fill={INK}>
          {line}
        </text>
      ))}
      <line x1={TEXT_COL_X} y1={GRID_TOP} x2={PAGE_WIDTH - TEXT_COL_X + 25} y2={GRID_TOP} stroke={INK} strokeWidth={0.5} />

      {/* Question slots */}
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
    </Box>
  )
}
