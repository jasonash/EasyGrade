import type { JSX } from 'react'
import { Box, Chip, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import UndoIcon from '@mui/icons-material/Undo'
import type { GradeResult, ScanPageDetail, StoredQuestion } from '@shared/types'
import { choiceLabel } from '@shared/layout'
import { scanImageUrl } from '@shared/scan-url'
import { choiceLetter, flagKindLabel } from '@/lib/grading'

interface Props {
  questions: StoredQuestion[]
  result: GradeResult
  page: ScanPageDetail
  /** Question currently being saved, to disable its controls. */
  busyQ: number | null
  /** `choice` sets an override (null = blank); `'reset'` removes it. */
  onOverride: (q: number, choice: number | null | 'reset') => void
}

const BLANK = 'blank'

/** The chosen letter must read at a glance: bold, primary text and border, not just a faint fill. */
export const ANSWER_GROUP_SX = {
  '& .MuiToggleButton-root.Mui-selected': { fontWeight: 700, borderColor: 'primary.main' }
} as const

/**
 * One row per question: what was read, whether it matches the key, flags,
 * and an A-E + Blank toggle that records a teacher override. Rows with a
 * crop (flagged or faint) show the strip of the scan under the controls.
 */
export function AnswerRows({ questions, result, page, busyQ, onOverride }: Props): JSX.Element {
  const overrides = new Map(result.overrides.map((o) => [o.q, o]))
  const flags = new Map(result.flags.map((f) => [f.q, f]))
  return (
    <Stack spacing={1}>
      {questions.map((question, q) => {
        const raw = result.rawAnswers[q] ?? null
        const final = result.finalAnswers[q] ?? null
        const override = overrides.get(q)
        const flag = flags.get(q)
        const correct = final !== null && final === question.correctChoice
        const crop = page.crops[`row_${q}`]
        const value = final === null ? BLANK : String(final)
        return (
          <Box key={question.id} sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2" sx={{ width: 32 }}>
                Q{q + 1}
              </Typography>
              <Typography variant="h6" sx={{ width: 22, textAlign: 'center', fontWeight: 600 }}>
                {choiceLetter(final, question.labelStyle)}
              </Typography>
              {correct ? (
                <CheckIcon fontSize="small" color="success" />
              ) : (
                <Tooltip title={`Key: ${choiceLetter(question.correctChoice, question.labelStyle)}`}>
                  <CloseIcon fontSize="small" color="error" />
                </Tooltip>
              )}
              {!correct ? (
                <Typography variant="caption" color="text.secondary">
                  key {choiceLetter(question.correctChoice, question.labelStyle)}
                </Typography>
              ) : null}
              {flag ? <Chip size="small" color="warning" variant="outlined" label={flagKindLabel(flag.kind)} /> : null}
              {override ? (
                <Tooltip title={`Detected ${choiceLetter(override.rawChoice, question.labelStyle)}${override.note ? `. ${override.note}` : ''}`}>
                  <Chip size="small" color="info" variant="outlined" label="edited" />
                </Tooltip>
              ) : null}
              <Box sx={{ flexGrow: 1 }} />
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={value}
                disabled={busyQ === q}
                onChange={(_, next: string | null) => {
                  if (next === null) return
                  const choice = next === BLANK ? null : Number(next)
                  onOverride(q, choice === raw ? 'reset' : choice)
                }}
                aria-label={`Answer for question ${q + 1}`}
                sx={ANSWER_GROUP_SX}
              >
                {question.choices.map((_, c) => (
                  <ToggleButton key={c} value={String(c)} sx={{ px: 1.25, py: 0.5, minWidth: 36 }}>
                    {choiceLabel(c, question.labelStyle)}
                  </ToggleButton>
                ))}
                <ToggleButton value={BLANK} sx={{ px: 1.25, py: 0.5 }}>
                  Blank
                </ToggleButton>
              </ToggleButtonGroup>
              {override ? (
                <Tooltip title="Remove override">
                  <span>
                    <IconButton size="small" disabled={busyQ === q} onClick={() => onOverride(q, 'reset')} aria-label={`Remove override for question ${q + 1}`}>
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
            </Stack>
            {crop ? (
              <Box sx={{ mt: 1, lineHeight: 0, bgcolor: '#fff', borderRadius: 0.5, overflow: 'hidden' }}>
                <img src={scanImageUrl(crop, page.processedAt)} alt={`Question ${q + 1} as scanned`} style={{ width: '100%', display: 'block' }} />
              </Box>
            ) : null}
          </Box>
        )
      })}
    </Stack>
  )
}
