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
  Select
} from '@mui/material'
import type { Section, Student } from '@shared/types'

interface Props {
  open: boolean
  student: Student | null
  sections: Section[]
  onClose: () => void
  onMove: (sectionId: number) => Promise<void>
}

export function MoveStudentDialog({ open, student, sections, onClose, onMove }: Props): JSX.Element {
  const currentSectionId = student?.sectionId ?? null
  const targets = sections.filter((s) => !s.archived && s.id !== currentSectionId)
  const [target, setTarget] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const first = sections.find((s) => !s.archived && s.id !== currentSectionId)
    setTarget(first?.id ?? '')
  }, [open, currentSectionId, sections])

  const submit = async (): Promise<void> => {
    if (target === '') return
    setBusy(true)
    try {
      await onMove(target)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Move Student</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {student ? `Move ${student.firstName} ${student.lastName} to another section.` : ''}
        </DialogContentText>
        {targets.length === 0 ? (
          <DialogContentText>There are no other active sections to move to.</DialogContentText>
        ) : (
          <FormControl fullWidth size="small">
            <InputLabel id="move-target-label">Section</InputLabel>
            <Select
              labelId="move-target-label"
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy || target === ''}>
          Move
        </Button>
      </DialogActions>
    </Dialog>
  )
}
