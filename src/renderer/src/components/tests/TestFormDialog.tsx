import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import type { Section, TestKind } from '@shared/types'
import { MAX_BUBBLES, MAX_TITLE_CHARS, MIN_BUBBLES, answerSheetCapacity } from '@shared/layout'
import { DEFAULT_ANSWER_SHEET_QUESTIONS, DEFAULT_BUBBLE_COUNT } from '@shared/schemas'

export interface TestFormValues {
  /** One section for a new test; one or more targets for a copy. */
  sectionIds: number[]
  title: string
  /** Copy only: finalize every copy right away so it can be printed. */
  finalizeNow: boolean
  /** Create only. */
  kind: TestKind
  /** Create only, answer sheets: bubbles per question and how many rows to start with. */
  defaultChoiceCount: number
  questionCount: number
}

const KIND_HELP: Record<TestKind, string> = {
  standard: 'Questions and choices are printed on the sheet, up to 10 questions.',
  answer_sheet: 'Bubbles only. The test itself lives in a document or PDF; up to 96 questions.'
}

interface Props {
  open: boolean
  mode: 'create' | 'copy'
  sections: Section[]
  /** Preselected section; for create with a fixed section the picker is hidden. */
  sectionId: number | null
  lockSection?: boolean
  initialTitle?: string
  description?: string
  /** Copy only: offer "Finalize copies now" (the source is finalized, so the copies will pass the same checks). */
  sourceFinalized?: boolean
  onClose: () => void
  onSubmit: (values: TestFormValues) => Promise<void>
}

/** Shared dialog for New Test (title + section) and Copy to sections (title + section checklist). */
export function TestFormDialog({
  open,
  mode,
  sections,
  sectionId,
  lockSection = false,
  initialTitle = '',
  description,
  sourceFinalized = false,
  onClose,
  onSubmit
}: Props): JSX.Element {
  const targets = sections.filter((s) => !s.archived || s.id === sectionId)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<number | ''>('')
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [finalizeNow, setFinalizeNow] = useState(false)
  const [kind, setKind] = useState<TestKind>('standard')
  const [bubbles, setBubbles] = useState(DEFAULT_BUBBLE_COUNT)
  const [questionCount, setQuestionCount] = useState(DEFAULT_ANSWER_SHEET_QUESTIONS)
  const [busy, setBusy] = useState(false)
  const capacity = answerSheetCapacity(bubbles).capacity

  useEffect(() => {
    if (!open) return
    setTitle(initialTitle)
    const first = sections.find((s) => !s.archived)
    setTarget(sectionId ?? first?.id ?? '')
    setChosen(new Set(sectionId !== null ? [sectionId] : []))
    setFinalizeNow(false)
    setKind('standard')
    setBubbles(DEFAULT_BUBBLE_COUNT)
    setQuestionCount(DEFAULT_ANSWER_SHEET_QUESTIONS)
    setBusy(false)
  }, [open, initialTitle, sectionId, sections])

  const sectionIds = mode === 'create' ? (target === '' ? [] : [target]) : [...chosen]
  const canSubmit = !busy && sectionIds.length > 0 && title.trim() !== ''

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit({
        sectionIds,
        title: title.trim(),
        finalizeNow: mode === 'copy' && sourceFinalized && finalizeNow,
        kind,
        defaultChoiceCount: bubbles,
        questionCount: Math.min(questionCount, capacity)
      })
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: number): void => {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <DialogTitle>{mode === 'create' ? 'New Test' : 'Copy Test'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {description ? <DialogContentText>{description}</DialogContentText> : null}
            {mode === 'create' ? (
              <Stack spacing={0.5}>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  color="primary"
                  value={kind}
                  onChange={(_, next: TestKind | null) => {
                    if (next) setKind(next)
                  }}
                  aria-label="Test type"
                >
                  <ToggleButton value="standard">Standard test</ToggleButton>
                  <ToggleButton value="answer_sheet">Answer sheet only</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  {KIND_HELP[kind]}
                </Typography>
              </Stack>
            ) : null}
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE_CHARS))}
              autoFocus
              fullWidth
              required
              placeholder="Unit 3 Quiz"
              helperText={`${title.length}/${MAX_TITLE_CHARS}`}
            />
            {mode === 'create' && kind === 'answer_sheet' ? (
              <Stack direction="row" spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel id="test-bubbles-label">Bubbles per question</InputLabel>
                  <Select
                    labelId="test-bubbles-label"
                    label="Bubbles per question"
                    value={bubbles}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setBubbles(next)
                      setQuestionCount((q) => Math.min(q, answerSheetCapacity(next).capacity))
                    }}
                  >
                    {Array.from({ length: MAX_BUBBLES - MIN_BUBBLES + 1 }, (_, i) => i + MIN_BUBBLES).map((n) => (
                      <MenuItem key={n} value={n}>
                        {n} (A to {String.fromCharCode(64 + n)})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel id="test-count-label">Questions</InputLabel>
                  <Select labelId="test-count-label" label="Questions" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
                    {Array.from({ length: capacity }, (_, i) => i + 1).map((n) => (
                      <MenuItem key={n} value={n}>
                        {n}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>Up to {capacity} fit on one page. You can change this later.</FormHelperText>
                </FormControl>
              </Stack>
            ) : null}
            {mode === 'create' && !lockSection ? (
              <FormControl fullWidth size="small">
                <InputLabel id="test-section-label">Section</InputLabel>
                <Select
                  labelId="test-section-label"
                  label="Section"
                  value={target}
                  onChange={(e) => setTarget(typeof e.target.value === 'number' ? e.target.value : '')}
                >
                  {targets.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                      {s.schoolYear ? ` (${s.schoolYear})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
            {mode === 'copy' ? (
              <FormControl component="fieldset" variant="standard">
                <FormLabel component="legend">Copy to</FormLabel>
                <FormGroup sx={{ maxHeight: 240, overflowY: 'auto', flexWrap: 'nowrap' }}>
                  {targets.map((s) => (
                    <FormControlLabel
                      key={s.id}
                      control={<Checkbox size="small" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} />}
                      label={`${s.name}${s.schoolYear ? ` (${s.schoolYear})` : ''}`}
                    />
                  ))}
                </FormGroup>
                <FormHelperText>
                  {chosen.size === 0 ? 'Pick at least one section.' : `${chosen.size} ${chosen.size === 1 ? 'copy' : 'copies'}, each with its own code and answer key.`}
                </FormHelperText>
              </FormControl>
            ) : null}
            {mode === 'copy' && sourceFinalized ? (
              <FormControlLabel
                control={<Switch size="small" checked={finalizeNow} onChange={(e) => setFinalizeNow(e.target.checked)} />}
                label="Finalize copies now"
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!canSubmit}>
            {mode === 'create' ? 'Create' : chosen.size > 1 ? `Copy to ${chosen.size} sections` : 'Copy'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
