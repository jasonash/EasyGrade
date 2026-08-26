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
  TextField
} from '@mui/material'
import type { Section } from '@shared/types'
import { MAX_TITLE_CHARS } from '@shared/layout'

export interface TestFormValues {
  /** One section for a new test; one or more targets for a copy. */
  sectionIds: number[]
  title: string
  /** Copy only: finalize every copy right away so it can be printed. */
  finalizeNow: boolean
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
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(initialTitle)
    const first = sections.find((s) => !s.archived)
    setTarget(sectionId ?? first?.id ?? '')
    setChosen(new Set(sectionId !== null ? [sectionId] : []))
    setFinalizeNow(false)
    setBusy(false)
  }, [open, initialTitle, sectionId, sections])

  const sectionIds = mode === 'create' ? (target === '' ? [] : [target]) : [...chosen]
  const canSubmit = !busy && sectionIds.length > 0 && title.trim() !== ''

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit({ sectionIds, title: title.trim(), finalizeNow: mode === 'copy' && sourceFinalized && finalizeNow })
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
