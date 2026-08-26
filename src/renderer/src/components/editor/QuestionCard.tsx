import type { JSX } from 'react'
import { Box, Button, Card, CardContent, Chip, IconButton, Radio, RadioGroup, Stack, TextField, Tooltip, Typography } from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import {
  CHOICE_LETTERS,
  MAX_CHOICES,
  MAX_CHOICE_CHARS,
  MAX_STEM_CHARS,
  MIN_CHOICES,
  unsupportedChars,
  type QuestionMeasure
} from '@shared/layout'

export interface EditorQuestion {
  key: number
  stem: string
  choices: string[]
  correctChoice: number
}

interface Props {
  index: number
  count: number
  question: EditorQuestion
  measure: QuestionMeasure | undefined
  readOnly: boolean
  onChange: (question: EditorQuestion) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

/** Sheets are single-line per field; newlines become spaces as you type. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

export function QuestionCard({ index, count, question, measure, readOnly, onChange, onMove, onRemove }: Props): JSX.Element {
  const badStem = unsupportedChars(question.stem)
  const fits = measure?.fits ?? true
  const problem = measure?.problems[0]

  return (
    <Card variant="outlined" sx={{ borderColor: fits ? 'divider' : 'error.main' }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Question {index + 1}
          </Typography>
          {measure ? (
            <Tooltip title={problem ?? `Uses ${Math.round(measure.usage * 100)}% of its slot`}>
              <Chip
                size="small"
                variant="outlined"
                color={fits ? 'success' : 'error'}
                label={fits ? 'fits' : problem ?? 'overflow'}
              />
            </Tooltip>
          ) : null}
          <Box sx={{ flexGrow: 1 }} />
          {readOnly ? null : (
            <>
              <IconButton size="small" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={onRemove} disabled={count <= 1} aria-label="Remove question">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Stack>

        <TextField
          label="Question"
          value={question.stem}
          onChange={(e) => onChange({ ...question, stem: oneLine(e.target.value).slice(0, MAX_STEM_CHARS) })}
          fullWidth
          multiline
          rows={3}
          size="small"
          error={badStem.length > 0}
          helperText={
            badStem.length > 0
              ? `Cannot print: ${badStem.join(' ')}`
              : `${question.stem.length}/${MAX_STEM_CHARS}`
          }
          slotProps={{ input: { readOnly } }}
          sx={{ mb: 1 }}
        />

        {/* One radio group per question: the arrow keys move the key between choices and screen readers announce the set. */}
        <RadioGroup
          name={`question-${index + 1}-key`}
          aria-label={`Correct answer for question ${index + 1}`}
          value={question.correctChoice}
          onChange={(e) => onChange({ ...question, correctChoice: Number(e.target.value) })}
          sx={{ gap: 0.5 }}
        >
          {question.choices.map((choice, i) => {
            const bad = unsupportedChars(choice)
            return (
              <Stack key={i} direction="row" alignItems="center" spacing={0.5}>
                <Tooltip title={question.correctChoice === i ? 'Correct answer' : 'Mark as correct'}>
                  <Radio size="small" value={i} inputProps={{ 'aria-label': `Choice ${CHOICE_LETTERS[i] ?? ''} is correct` }} />
                </Tooltip>
                <TextField
                  value={choice}
                  onChange={(e) => {
                    const choices = [...question.choices]
                    choices[i] = oneLine(e.target.value).slice(0, MAX_CHOICE_CHARS)
                    onChange({ ...question, choices })
                  }}
                  size="small"
                  fullWidth
                  placeholder={`Choice ${CHOICE_LETTERS[i] ?? ''}`}
                  error={bad.length > 0}
                  slotProps={{
                    input: {
                      readOnly,
                      startAdornment: (
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1, minWidth: 14 }}>
                          {CHOICE_LETTERS[i]}
                        </Typography>
                      )
                    }
                  }}
                />
                {readOnly ? null : (
                  <IconButton
                    size="small"
                    aria-label={`Remove choice ${CHOICE_LETTERS[i] ?? ''}`}
                    disabled={question.choices.length <= MIN_CHOICES}
                    onClick={() => {
                      const choices = question.choices.filter((_, j) => j !== i)
                      let correctChoice = question.correctChoice
                      if (correctChoice === i) correctChoice = 0
                      else if (correctChoice > i) correctChoice -= 1
                      onChange({ ...question, choices, correctChoice })
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            )
          })}
        </RadioGroup>

        {readOnly ? null : (
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={question.choices.length >= MAX_CHOICES}
            onClick={() => onChange({ ...question, choices: [...question.choices, ''] })}
            sx={{ mt: 1 }}
          >
            Choice
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
