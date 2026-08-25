import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import PrintIcon from '@mui/icons-material/Print'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import VisibilityIcon from '@mui/icons-material/Visibility'
import type { PrintOutcome, PrintRequest, Student } from '@shared/types'
import { MAX_BLANK_COPIES, MAX_DATE_LABEL_CHARS } from '@shared/schemas'
import { api, unwrap } from '@/api'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'

export interface PrintableTest {
  id: number
  title: string
  sectionId: number
}

interface Props {
  open: boolean
  test: PrintableTest | null
  onClose: () => void
  /** Called after a run was recorded (save or print) so lists can refresh. */
  onPrinted?: (outcome: PrintOutcome) => void
}

type Mode = 'all' | 'selected'
type Action = 'preview' | 'save' | 'print'

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PrintDialog({ open, test, onClose, onPrinted }: Props): JSX.Element {
  const defaultBlankCopies = useSettingsStore((s) => s.settings.defaultBlankCopies)
  const toast = useUiStore((s) => s.toast)

  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [blankCount, setBlankCount] = useState(String(defaultBlankCopies))
  const [dateLabel, setDateLabel] = useState(todayLabel())
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)

  const testId = test?.id ?? null
  const sectionId = test?.sectionId ?? null

  // Reset the form and load the roster (including inactive students for make-ups) each time the dialog opens.
  useEffect(() => {
    if (!open || sectionId === null) return
    let cancelled = false
    setMode('all')
    setBlankCount(String(defaultBlankCopies))
    setDateLabel(todayLabel())
    setError(null)
    setBusy(null)
    setLoading(true)
    void unwrap(api.students.listBySection(sectionId, true))
      .then((list) => {
        if (cancelled) return
        setStudents(list)
        setSelected(new Set(list.filter((s) => s.active).map((s) => s.id)))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, sectionId, defaultBlankCopies])

  const active = useMemo(() => students.filter((s) => s.active), [students])
  const blank = Number.parseInt(blankCount, 10)
  const blankValid = Number.isInteger(blank) && blank >= 0 && blank <= MAX_BLANK_COPIES
  const studentCount = mode === 'all' ? active.length : selected.size
  const total = studentCount + (blankValid ? blank : 0)
  const canRun = !loading && busy === null && blankValid && total > 0 && testId !== null

  const request = (): PrintRequest | null => {
    if (testId === null || !blankValid) return null
    const trimmed = dateLabel.trim()
    return {
      testId,
      studentIds: mode === 'all' ? null : [...selected],
      blankCount: blank,
      dateLabel: trimmed === '' ? null : trimmed
    }
  }

  const run = async (action: Action): Promise<void> => {
    const input = request()
    if (!input) return
    setBusy(action)
    setError(null)
    try {
      if (action === 'preview') {
        await unwrap(api.print.preview(input))
        toast('info', 'Preview opened in your PDF viewer')
        return
      }
      const outcome = action === 'save' ? await unwrap(api.print.savePdf(input)) : await unwrap(api.print.printPdf(input))
      if (!outcome) return
      const sheets = `${outcome.pageCount} ${outcome.pageCount === 1 ? 'sheet' : 'sheets'}`
      if (action === 'save') toast('success', `Saved ${sheets} to ${outcome.path}`)
      else toast('success', `Opened ${sheets} in your PDF viewer. Use its Print command to send them to the printer.`)
      onPrinted?.(outcome)
      onClose()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(null)
    }
  }

  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Print: {test?.title ?? ''}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <FormControl disabled={loading || busy !== null}>
            <FormLabel>Students</FormLabel>
            <RadioGroup value={mode} onChange={(e) => setMode(e.target.value === 'selected' ? 'selected' : 'all')}>
              <FormControlLabel value="all" control={<Radio />} label={`All active (${active.length})`} />
              <FormControlLabel value="selected" control={<Radio />} label={`Selected (${selected.size})`} />
            </RadioGroup>
          </FormControl>

          {mode === 'selected' ? (
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {selected.size} of {students.length} selected
                </Typography>
                <Button size="small" onClick={() => setSelected(new Set(active.map((s) => s.id)))}>
                  Active
                </Button>
                <Button size="small" onClick={() => setSelected(new Set(students.map((s) => s.id)))}>
                  All
                </Button>
                <Button size="small" onClick={() => setSelected(new Set())}>
                  None
                </Button>
              </Stack>
              <List dense disablePadding sx={{ maxHeight: 240, overflowY: 'auto' }}>
                {students.map((s) => (
                  <ListItemButton key={s.id} onClick={() => toggle(s.id)} disabled={busy !== null}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox edge="start" size="small" checked={selected.has(s.id)} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText primary={`${s.lastName}, ${s.firstName}`} secondary={s.studentNumber ?? undefined} />
                    {!s.active ? <Chip size="small" label="Inactive" variant="outlined" /> : null}
                  </ListItemButton>
                ))}
                {students.length === 0 && !loading ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                    No students in this section yet.
                  </Typography>
                ) : null}
              </List>
            </Box>
          ) : null}

          <Stack direction="row" spacing={2}>
            <TextField
              label="Blank copies"
              type="number"
              size="small"
              value={blankCount}
              onChange={(e) => setBlankCount(e.target.value)}
              error={!blankValid}
              helperText={blankValid ? 'Extra sheets with name and section boxes' : `0 to ${MAX_BLANK_COPIES}`}
              slotProps={{ htmlInput: { min: 0, max: MAX_BLANK_COPIES, step: 1 } }}
              sx={{ width: 180 }}
              disabled={busy !== null}
            />
            <TextField
              label="Date line"
              size="small"
              value={dateLabel}
              onChange={(e) => setDateLabel(e.target.value.slice(0, MAX_DATE_LABEL_CHARS))}
              helperText="Printed after Date:. Clear to leave a blank line for students."
              fullWidth
              disabled={busy !== null}
              slotProps={{
                input: {
                  endAdornment:
                    dateLabel !== '' ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setDateLabel('')} aria-label="Clear date" edge="end">
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null
                }
              }}
            />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {studentCount} personalized + {blankValid ? blank : 0} blank = <strong>{total}</strong>{' '}
            {total === 1 ? 'sheet' : 'sheets'}
          </Typography>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {busy !== null || loading ? <LinearProgress /> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy !== null}>
          Cancel
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button startIcon={<VisibilityIcon />} onClick={() => void run('preview')} disabled={!canRun}>
          Preview
        </Button>
        <Button startIcon={<SaveAltIcon />} onClick={() => void run('save')} disabled={!canRun} variant="outlined">
          Save PDF...
        </Button>
        <Button startIcon={<PrintIcon />} onClick={() => void run('print')} disabled={!canRun} variant="contained">
          Print...
        </Button>
      </DialogActions>
    </Dialog>
  )
}
