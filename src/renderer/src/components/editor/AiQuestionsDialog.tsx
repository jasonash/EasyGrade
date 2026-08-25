import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import type { DraftQuestion } from '@shared/types'
import { CHOICE_LETTERS, MAX_CHOICES, MAX_QUESTIONS, MIN_CHOICES } from '@shared/layout'
import { buildQuestionPrompt, parseQuestions, type ParsedQuestion } from '@shared/question-import'
import { api, unwrap } from '@/api'
import { useUiStore } from '@/stores/ui.store'

interface Props {
  open: boolean
  /** Questions already in the editor that are not blank. */
  existingCount: number
  /** Default focus line for the prompt, usually the test title. */
  topic: string
  onClose: () => void
  onImport: (questions: DraftQuestion[], mode: 'append' | 'replace') => void
}

/**
 * Three steps, no AI inside the app: copy a prompt, paste it into whatever
 * assistant the teacher uses together with the week's material, paste the
 * reply back here. The reply is parsed leniently and previewed before import.
 */
export function AiQuestionsDialog({ open, existingCount, topic, onClose, onImport }: Props): JSX.Element {
  const toast = useUiStore((s) => s.toast)
  const room = Math.max(0, MAX_QUESTIONS - existingCount)
  const [count, setCount] = useState(Math.min(5, Math.max(1, room)))
  const [choices, setChoices] = useState(4)
  const [gradeLevel, setGradeLevel] = useState('')
  const [focus, setFocus] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [reply, setReply] = useState('')

  const prompt = useMemo(
    () => buildQuestionPrompt({ count, choices, gradeLevel, topic: focus.trim() !== '' ? focus : topic }),
    [count, choices, gradeLevel, focus, topic]
  )
  const parsed = useMemo(() => parseQuestions(reply), [reply])
  const found = parsed.questions.length
  const withIssues = parsed.questions.filter((q) => q.issues.length > 0).length
  const canAppend = found > 0 && found <= room
  const canReplace = found > 0 && found <= MAX_QUESTIONS

  const copyPrompt = (): void => {
    // The page clipboard needs focus; the main process clipboard does not.
    void navigator.clipboard
      .writeText(prompt)
      .catch(() => unwrap(api.app.copyText(prompt)))
      .then(() => toast('success', 'Prompt copied. Paste it into your AI assistant.'))
      .catch(() => {
        setShowPrompt(true)
        toast('error', 'Could not copy automatically. Select the prompt below and copy it.')
      })
  }

  const finish = (mode: 'append' | 'replace'): void => {
    onImport(parsed.questions.map(toDraft), mode)
    setReply('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Write questions with AI</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            EasyGrade does not talk to any AI service. You copy a prompt, paste it into the AI assistant you already use, and paste its
            reply back here. Your material never passes through EasyGrade.
          </Typography>

          <Box>
            <StepHeading n={1} text="Copy a prompt" />
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              <TextField
                select
                label="Questions"
                size="small"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                sx={{ width: 120 }}
              >
                {Array.from({ length: MAX_QUESTIONS }, (_, i) => i + 1).map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Choices each"
                size="small"
                value={choices}
                onChange={(e) => setChoices(Number(e.target.value))}
                sx={{ width: 140 }}
              >
                {Array.from({ length: MAX_CHOICES - MIN_CHOICES + 1 }, (_, i) => i + MIN_CHOICES).map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Grade level"
                size="small"
                placeholder="10th grade"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                sx={{ width: 160 }}
              />
              <TextField
                label="Focus (optional)"
                size="small"
                placeholder={topic || 'Topic or instructions'}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                sx={{ flexGrow: 1, minWidth: 220 }}
              />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copyPrompt}>
                Copy prompt
              </Button>
              <Button size="small" onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? 'Hide prompt' : 'Show prompt'}
              </Button>
            </Stack>
            <Collapse in={showPrompt}>
              <TextField value={prompt} multiline fullWidth size="small" slotProps={{ input: { readOnly: true } }} sx={{ mt: 1.5 }} />
            </Collapse>
          </Box>

          <Box>
            <StepHeading n={2} text="Paste it into your AI assistant with this week's material" />
            <Typography variant="body2" color="text.secondary">
              Open the AI assistant you normally use, paste the prompt, then paste or attach the material the quiz should cover (notes,
              a reading, a slide deck) and send it. When it answers, select the whole reply and copy it.
            </Typography>
          </Box>

          <Box>
            <StepHeading n={3} text="Paste the reply here" />
            <TextField
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              multiline
              rows={6}
              fullWidth
              placeholder={'1. Which particle carries a negative charge?\nA) Proton\nB) Electron *\nC) Neutron\nD) Photon'}
            />
            {parsed.error ? (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {parsed.error}
              </Alert>
            ) : null}
            {found > 0 ? (
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="subtitle2">
                    {found} question{found === 1 ? '' : 's'} found
                  </Typography>
                  {withIssues > 0 ? <Chip size="small" color="warning" label={`${withIssues} to check`} /> : null}
                  {found > room ? (
                    <Typography variant="body2" color="warning.main">
                      Only {room} more fit on the page with the {existingCount} already in the test.
                    </Typography>
                  ) : null}
                </Stack>
                {parsed.questions.map((q, i) => (
                  <QuestionPreview key={i} index={i} question={q} />
                ))}
              </Stack>
            ) : null}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {existingCount > 0 ? (
          <Button color="warning" onClick={() => finish('replace')} disabled={!canReplace}>
            Replace {existingCount} existing
          </Button>
        ) : null}
        <Button variant="contained" onClick={() => finish('append')} disabled={!canAppend}>
          {existingCount > 0 ? 'Add to test' : 'Add questions'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function StepHeading({ n, text }: { n: number; text: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
      <Chip label={n} size="small" color="primary" />
      <Typography variant="subtitle1">{text}</Typography>
    </Stack>
  )
}

function QuestionPreview({ index, question }: { index: number; question: ParsedQuestion }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {index + 1}. {question.stem || <em>(blank)</em>}
      </Typography>
      <Stack sx={{ mt: 0.5, pl: 1 }}>
        {question.choices.map((c, i) => (
          <Typography
            key={i}
            variant="body2"
            color={question.correctChoice === i ? 'success.main' : 'text.secondary'}
            sx={{ fontWeight: question.correctChoice === i ? 600 : 400 }}
          >
            {CHOICE_LETTERS[i] ?? i + 1}) {c || <em>(blank)</em>}
            {question.correctChoice === i ? '  ✓' : ''}
          </Typography>
        ))}
      </Stack>
      {question.issues.length > 0 ? (
        <>
          <Divider sx={{ my: 1 }} />
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {question.issues.map((issue) => (
              <Chip key={issue} size="small" color="warning" variant="outlined" label={issue} />
            ))}
          </Stack>
        </>
      ) : null}
    </Paper>
  )
}

/** Editor questions need a correct index; an unmarked question defaults to A and carries its warning chip into the preview above. */
function toDraft(q: ParsedQuestion): DraftQuestion {
  const choices = q.choices.length >= MIN_CHOICES ? q.choices : [...q.choices, ...Array.from({ length: MIN_CHOICES - q.choices.length }, () => '')]
  return { stem: q.stem, choices, correctChoice: q.correctChoice ?? 0 }
}
