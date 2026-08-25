import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import type { ImportPreview, ImportRow, ImportRowStatus } from '@shared/types'
import { describeError } from '@/lib/errors'

export type ImportSource = { kind: 'paste' } | { kind: 'file'; name: string; text: string }

interface Props {
  open: boolean
  source: ImportSource
  onClose: () => void
  onPreview: (text: string) => Promise<ImportPreview>
  onCommit: (rows: ImportRow[]) => Promise<number>
}

const STATUS_COLOR: Record<ImportRowStatus, 'success' | 'warning' | 'error'> = {
  new: 'success',
  duplicate: 'warning',
  error: 'error'
}

const PASTE_HINT =
  'Copy the roster cells from a spreadsheet and paste them here. Columns can be last name, first name, ' +
  'and student number, or a single "Last, First" column with an optional number beside it. A header row is optional.'

export function ImportDialog({ open, source, onClose, onPreview, onCommit }: Props): JSX.Element {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the latest callback without making it an effect dependency; the
  // parent passes a fresh arrow each render.
  const previewRef = useRef(onPreview)
  previewRef.current = onPreview

  const runPreview = useCallback(async (value: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setPreview(await previewRef.current(value))
    } catch (err) {
      setError(describeError(err))
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setError(null)
    setSkipDuplicates(true)
    if (source.kind === 'file') {
      setText(source.text)
      void runPreview(source.text)
    } else {
      setText('')
    }
  }, [open, source, runPreview])

  const selected = preview
    ? preview.rows.filter((r) => r.status === 'new' || (!skipDuplicates && r.status === 'duplicate'))
    : []

  const commit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onCommit(selected)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const title = source.kind === 'file' ? `Import ${source.name}` : 'Paste from Spreadsheet'

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {busy ? <LinearProgress sx={{ mb: 2 }} /> : null}
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {preview === null ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {PASTE_HINT}
            </Typography>
            <TextField
              multiline
              minRows={10}
              maxRows={20}
              fullWidth
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Adams\tMaria\t100234\nBaker\tDevon\t100251'}
              slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
            />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" color="success" label={`${preview.counts.new} new`} />
              <Chip size="small" color="warning" label={`${preview.counts.duplicate} duplicate`} />
              <Chip size="small" color="error" label={`${preview.counts.error} error`} />
              <Box sx={{ flexGrow: 1 }} />
              {preview.counts.duplicate > 0 ? (
                <FormControlLabel
                  control={
                    <Switch size="small" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                  }
                  label="Skip duplicates"
                />
              ) : null}
            </Stack>

            <TableContainer sx={{ maxHeight: 420, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width={56}>Line</TableCell>
                    <TableCell>Last</TableCell>
                    <TableCell>First</TableCell>
                    <TableCell>Student #</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.map((row) => {
                    const included = selected.includes(row)
                    return (
                      <TableRow key={row.line} sx={{ opacity: included ? 1 : 0.55 }}>
                        <TableCell>{row.line}</TableCell>
                        <TableCell>{row.lastName}</TableCell>
                        <TableCell>{row.firstName}</TableCell>
                        <TableCell>{row.studentNumber ?? ''}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Tooltip title={row.message ?? ''} disableHoverListener={!row.message}>
                              <Chip size="small" color={STATUS_COLOR[row.status]} variant="outlined" label={row.status} />
                            </Tooltip>
                            {row.message ? (
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 320 }}>
                                {row.message}
                              </Typography>
                            ) : null}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {preview === null ? (
          <Button variant="contained" onClick={() => void runPreview(text)} disabled={busy || text.trim() === ''}>
            Preview
          </Button>
        ) : (
          <>
            {source.kind === 'paste' ? (
              <Button onClick={() => setPreview(null)} disabled={busy}>
                Back
              </Button>
            ) : null}
            <Button variant="contained" onClick={() => void commit()} disabled={busy || selected.length === 0}>
              Import {selected.length} {selected.length === 1 ? 'student' : 'students'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
