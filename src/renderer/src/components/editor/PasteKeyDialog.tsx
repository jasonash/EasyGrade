import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, List, ListItem, ListItemText, Stack, TextField, Typography } from '@mui/material'
import { parseAnswerKey, type KeyRowSpec } from '@shared/answer-key-import'

interface Props {
  open: boolean
  rows: KeyRowSpec[]
  onClose: () => void
  /** Choice per row, null where the paste said nothing about that row. */
  onApply: (answers: (number | null)[]) => void
}

/** Paste the answer key from the test document; rows the paste covers get their key set. */
export function PasteKeyDialog({ open, rows, onClose, onApply }: Props): JSX.Element {
  const [text, setText] = useState('')
  useEffect(() => {
    if (open) setText('')
  }, [open])

  const parsed = useMemo(() => (text.trim() === '' ? null : parseAnswerKey(text, rows)), [text, rows])
  const canApply = parsed !== null && parsed.error === null && parsed.found > 0

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Paste answer key</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <DialogContentText>
            Paste the key from your test document. Numbered lines like <code>1. B</code> or a plain run like <code>B D A C</code> both work; true/false rows take T
            and F.
          </DialogContentText>
          <TextField
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            minRows={4}
            maxRows={12}
            autoFocus
            fullWidth
            placeholder={'1. B\n2. D\n3. A'}
            inputProps={{ 'aria-label': 'Answer key text' }}
          />
          {parsed ? (
            parsed.error ? (
              <Alert severity="warning">{parsed.error}</Alert>
            ) : (
              <Alert severity={parsed.issues.length > 0 ? 'info' : 'success'}>
                {parsed.found} of {rows.length} answers found.
                {parsed.issues.length > 0 ? ' Please check:' : ''}
                {parsed.issues.length > 0 ? (
                  <List dense disablePadding sx={{ mt: 0.5 }}>
                    {parsed.issues.slice(0, 8).map((issue, i) => (
                      <ListItem key={i} disableGutters sx={{ py: 0 }}>
                        <ListItemText primary={issue} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    ))}
                    {parsed.issues.length > 8 ? (
                      <Typography variant="body2" color="text.secondary">
                        and {parsed.issues.length - 8} more
                      </Typography>
                    ) : null}
                  </List>
                ) : null}
              </Alert>
            )
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canApply}
          onClick={() => {
            if (parsed) onApply(parsed.answers)
          }}
        >
          {parsed && parsed.found > 0 ? `Apply ${parsed.found} answers` : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
