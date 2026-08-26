import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField
} from '@mui/material'
import type { Section } from '@shared/types'
import { MAX_TITLE_CHARS } from '@shared/layout'

interface Props {
  open: boolean
  mode: 'create' | 'copy'
  sections: Section[]
  /** Preselected section; for create with a fixed section the picker is hidden. */
  sectionId: number | null
  lockSection?: boolean
  initialTitle?: string
  description?: string
  onClose: () => void
  onSubmit: (values: { sectionId: number; title: string }) => Promise<void>
}

/** Shared dialog for New Test (title + section) and Copy to section (section + title). */
export function TestFormDialog({
  open,
  mode,
  sections,
  sectionId,
  lockSection = false,
  initialTitle = '',
  description,
  onClose,
  onSubmit
}: Props): JSX.Element {
  const targets = sections.filter((s) => !s.archived || s.id === sectionId)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(initialTitle)
    const first = sections.find((s) => !s.archived)
    setTarget(sectionId ?? first?.id ?? '')
    setBusy(false)
  }, [open, initialTitle, sectionId, sections])

  const submit = async (): Promise<void> => {
    if (target === '' || title.trim() === '') return
    setBusy(true)
    try {
      await onSubmit({ sectionId: target, title: title.trim() })
    } finally {
      setBusy(false)
    }
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
              placeholder="Unit 3 Quiz"
              helperText={`${title.length}/${MAX_TITLE_CHARS}`}
            />
            {lockSection ? null : (
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
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy || target === '' || title.trim() === ''}>
            {mode === 'create' ? 'Create' : 'Copy'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
