import type { JSX } from 'react'
import { Alert, Snackbar } from '@mui/material'
import { useUiStore } from '@/stores/ui.store'

/** Renders the oldest pending toast; the rest queue behind it. */
export function Toasts(): JSX.Element | null {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  const current = toasts[0]
  if (!current) return null
  return (
    <Snackbar
      key={current.id}
      open
      autoHideDuration={4000}
      onClose={() => dismiss(current.id)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={current.severity} variant="filled" onClose={() => dismiss(current.id)}>
        {current.text}
      </Alert>
    </Snackbar>
  )
}