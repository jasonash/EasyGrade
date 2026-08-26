import type { JSX } from 'react'
import { Alert, Button, IconButton, Snackbar, type SnackbarCloseReason } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useUiStore, type ToastMessage } from '@/stores/ui.store'

/**
 * How long a toast stays. Errors wait to be dismissed (they usually explain
 * what to do next); warnings and toasts with an Undo button get long enough
 * to act on; plain confirmations go quickly.
 */
function duration(toast: ToastMessage): number | null {
  if (toast.severity === 'error') return null
  if (toast.severity === 'warning' || toast.action) return 8000
  return 4000
}

/** Renders the oldest pending toast; the rest queue behind it. */
export function Toasts(): JSX.Element | null {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  const current = toasts[0]
  if (!current) return null

  // Clicking elsewhere on the page must not swallow the message.
  const close = (_event: unknown, reason?: SnackbarCloseReason): void => {
    if (reason === 'clickaway') return
    dismiss(current.id)
  }

  const action = current.action
  return (
    <Snackbar
      key={current.id}
      open
      autoHideDuration={duration(current)}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={current.severity}
        variant="filled"
        action={
          <>
            {action ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  dismiss(current.id)
                  action.onClick()
                }}
              >
                {action.label}
              </Button>
            ) : null}
            <IconButton color="inherit" size="small" aria-label="Dismiss" onClick={() => dismiss(current.id)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      >
        {current.text}
      </Alert>
    </Snackbar>
  )
}
