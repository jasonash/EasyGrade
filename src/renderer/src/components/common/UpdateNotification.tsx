import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  LinearProgress,
  Snackbar,
  Typography
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { UpdateState } from '@shared/types'
import { api, unwrap } from '@/api'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { formatBytes } from '@/lib/format'

/**
 * Update flow, mirroring StraboMicro2: a snackbar offers the download, shows
 * progress, and reports download errors with a retry; a dialog asks to
 * restart once the update is on disk. Check failures stay silent here (they
 * are usually just "offline"); a manual check from Settings reports them.
 */
export function UpdateNotification(): JSX.Element {
  const toast = useUiStore((s) => s.toast)
  const [state, setState] = useState<UpdateState | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [restartOpen, setRestartOpen] = useState(false)
  const [restartDismissed, setRestartDismissed] = useState(false)

  useEffect(() => {
    void unwrap(api.update.getState())
      .then(setState)
      .catch((err: unknown) => toast('warning', `Update status unavailable: ${describeError(err)}`))
    return api.update.onStatus((next) => {
      setState(next)
      if (next.status.status === 'downloaded' && !restartDismissed) setRestartOpen(true)
    })
  }, [restartDismissed, toast])

  const download = (): void => {
    void unwrap(api.update.download()).catch((err: unknown) => toast('error', describeError(err)))
  }
  const install = (): void => {
    void unwrap(api.update.install()).catch((err: unknown) => toast('error', describeError(err)))
  }

  const status = state?.status
  let content: JSX.Element | null = null
  if (status?.status === 'available' && dismissedVersion !== status.version) {
    content = (
      <Alert
        severity="info"
        action={
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Button color="inherit" size="small" onClick={download}>
              Download
            </Button>
            <IconButton size="small" color="inherit" onClick={() => setDismissedVersion(status.version)} aria-label="Dismiss">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        EasyGrade {status.version} is available
      </Alert>
    )
  } else if (status?.status === 'downloading') {
    const known = status.total > 0
    content = (
      <Alert severity="info" icon={false} sx={{ width: 360 }}>
        <Typography variant="body2">Downloading {status.version ? `EasyGrade ${status.version}` : 'the update'}...</Typography>
        <LinearProgress variant={known ? 'determinate' : 'indeterminate'} value={known ? status.percent : undefined} sx={{ mt: 1 }} />
        {known ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {formatBytes(status.transferred)} of {formatBytes(status.total)}
            {status.bytesPerSecond > 0 ? ` (${formatBytes(status.bytesPerSecond)}/s)` : ''}
          </Typography>
        ) : null}
      </Alert>
    )
  } else if (status?.status === 'error' && status.phase === 'download' && dismissedVersion !== 'error') {
    content = (
      <Alert
        severity="error"
        action={
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Button color="inherit" size="small" onClick={download}>
              Retry
            </Button>
            <IconButton size="small" color="inherit" onClick={() => setDismissedVersion('error')} aria-label="Dismiss">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        The update could not be downloaded: {status.message}
      </Alert>
    )
  }

  const downloadedVersion = status?.status === 'downloaded' ? status.version : null
  const releaseNotes = status?.status === 'downloaded' ? status.releaseNotes : null

  return (
    <>
      <Snackbar open={content !== null} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {content ?? <div />}
      </Snackbar>

      <Dialog open={restartOpen && downloadedVersion !== null} onClose={() => setRestartOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Update ready to install</DialogTitle>
        <DialogContent>
          <DialogContentText>
            EasyGrade {downloadedVersion} has been downloaded. Restart now to apply it, or keep working and it will be installed the next time
            EasyGrade quits.
          </DialogContentText>
          {releaseNotes ? (
            <Box
              sx={{
                mt: 2,
                p: 2,
                bgcolor: 'action.hover',
                borderRadius: 1,
                maxHeight: 220,
                overflow: 'auto',
                fontSize: '0.85rem',
                '& h1, & h2, & h3': { fontSize: '0.95rem', fontWeight: 600, mt: 1, mb: 0.5 },
                '& ul': { pl: 2.5, my: 0.5 },
                '& p': { my: 0.5 }
              }}
              // Release notes come from this project's own GitHub release, rendered by electron-updater as HTML.
              dangerouslySetInnerHTML={{ __html: releaseNotes }}
            />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRestartOpen(false)
              setRestartDismissed(true)
            }}
          >
            Later
          </Button>
          <Button variant="contained" onClick={install}>
            Restart now
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
