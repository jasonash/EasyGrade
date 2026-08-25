import type { JSX } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import BackupIcon from '@mui/icons-material/Backup'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import RestoreIcon from '@mui/icons-material/Restore'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import type { AppInfo, BackupStatus, PurgePreview, ThemeMode, UpdateState } from '@shared/types'
import { api, unwrap } from '@/api'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { formatBytes, formatDateTime, formatShortDate } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

/** Long enough for the restored notice to be seen before the page reloads. */
const RELOAD_DELAY_MS = 800

export function SettingsPage(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const reloadSettings = useSettingsStore((s) => s.load)
  const toast = useUiStore((s) => s.toast)

  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backup, setBackup] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState<'purge' | 'backup' | 'restore' | 'reset' | 'update' | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [purgePreview, setPurgePreview] = useState<PurgePreview | null>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  /** Notice shown while the page waits to reload after a restore or reset. */
  const [reloadNotice, setReloadNotice] = useState<string | null>(null)

  const loadBackupStatus = useCallback((): void => {
    void unwrap(api.backup.status())
      .then(setBackup)
      .catch(() => setBackup(null))
  }, [])

  useEffect(() => {
    void unwrap(api.app.info())
      .then(setInfo)
      .catch(() => setInfo(null))
    void unwrap(api.update.getState())
      .then(setUpdateState)
      .catch(() => setUpdateState(null))
    loadBackupStatus()
    return api.update.onStatus(setUpdateState)
  }, [loadBackupStatus])

  const checkForUpdates = (): void => {
    setBusy('update')
    void unwrap(api.update.check())
      .then((state) => {
        setUpdateState(state)
        const status = state.status
        if (!state.enabled) toast('info', 'Automatic updates are off in development builds.')
        else if (status.status === 'not-available') toast('success', `EasyGrade ${state.currentVersion} is the latest version.`)
        else if (status.status === 'error') toast('error', `Could not check for updates: ${status.message}`)
        // "available" and later states are shown by the update notification.
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(null))
  }

  const save = async (patch: Parameters<typeof update>[0]): Promise<boolean> => {
    try {
      await update(patch)
      return true
    } catch (err) {
      toast('error', describeError(err))
      return false
    }
  }

  const setTheme = (mode: ThemeMode): void => {
    void save({ theme: mode })
  }

  const previewPurge = (): void => {
    setBusy('purge')
    void unwrap(api.scan.purgePreview())
      .then((preview) => {
        if (preview.batchCount === 0) {
          toast('info', `Nothing to purge: no batches older than ${preview.retentionDays} days still have images`)
          return
        }
        setPurgePreview(preview)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(null))
  }

  const purge = (): void => {
    setBusy('purge')
    void unwrap(api.scan.purge())
      .then((outcome) => {
        setPurgePreview(null)
        toast('success', `Purged ${outcome.pageCount} page image${outcome.pageCount === 1 ? '' : 's'} from ${outcome.batchCount} batch${outcome.batchCount === 1 ? '' : 'es'}, freeing ${formatBytes(outcome.bytes)}`)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(null))
  }

  const chooseBackupDir = (): void => {
    void unwrap(api.backup.chooseDir())
      .then(async (dir) => {
        if (!dir) return
        await reloadSettings()
        loadBackupStatus()
      })
      .catch((err: unknown) => toast('error', describeError(err)))
  }

  const backUpNow = (): void => {
    setBusy('backup')
    void unwrap(api.backup.create())
      .then(async (outcome) => {
        await reloadSettings()
        loadBackupStatus()
        toast('success', `Backed up: database ${formatBytes(outcome.dbBytes)}, ${outcome.scanFilesCopied} scan file${outcome.scanFilesCopied === 1 ? '' : 's'} copied`)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(null))
  }

  const restore = (): void => {
    setBusy('restore')
    void unwrap(api.backup.restore())
      .then((outcome) => {
        setRestoreOpen(false)
        if (!outcome) return
        reloadSoon('Backup restored. Reloading...')
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(null))
  }

  const reset = (): void => {
    setBusy('reset')
    void unwrap(api.backup.reset())
      .then(() => {
        setResetOpen(false)
        reloadSoon('All data cleared. Reloading...')
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setBusy(null))
  }

  /** The main process has already reopened the database; a reload drops every cached store and refetches from it. */
  const reloadSoon = (notice: string): void => {
    setReloadNotice(notice)
    window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
  }

  const newest = backup?.snapshots[0] ?? null

  return (
    <>
      <PageHeader title="Settings" />
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        {reloadNotice ? <Alert severity="info">{reloadNotice}</Alert> : null}

        <Paper variant="outlined" sx={{ p: 3 }}>
          <FormControl>
            <FormLabel>Appearance</FormLabel>
            <RadioGroup row value={settings.theme} onChange={(e) => setTheme(e.target.value === 'light' ? 'light' : 'dark')}>
              <FormControlLabel value="dark" control={<Radio />} label="Dark" />
              <FormControlLabel value="light" control={<Radio />} label="Light" />
            </RadioGroup>
          </FormControl>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Printing
          </Typography>
          <NumberSetting
            label="Default blank copies"
            value={settings.defaultBlankCopies}
            min={0}
            max={50}
            helper="Extra unnamed sheets suggested in the Print dialog"
            onCommit={(value) => save({ defaultBlankCopies: value })}
          />
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Scans
          </Typography>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <NumberSetting
              label="Keep page images for (days)"
              value={settings.scanRetentionDays}
              min={1}
              max={3650}
              helper="Nothing is deleted automatically. Purge removes only page images; results stay."
              onCommit={(value) => save({ scanRetentionDays: value })}
            />
            <Button variant="outlined" startIcon={<DeleteSweepIcon />} onClick={previewPurge} disabled={busy !== null} sx={{ mt: 1 }}>
              Purge now...
            </Button>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Backup
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all' }}>
                {settings.backupDir ? (
                  <>
                    Folder: {settings.backupDir}
                    {backup && !backup.dirOk ? (
                      <Typography component="span" variant="body2" color="warning.main">
                        {' '}
                        (not reachable right now)
                      </Typography>
                    ) : null}
                  </>
                ) : (
                  <Typography component="span" variant="body2" color="text.secondary">
                    No backup folder chosen. Pick a folder, ideally one that a cloud drive syncs, so a lost or broken computer does not mean lost grades.
                  </Typography>
                )}
              </Typography>
              <Button variant="outlined" size="small" startIcon={<FolderOpenIcon />} onClick={chooseBackupDir} disabled={busy !== null}>
                {settings.backupDir ? 'Change...' : 'Choose folder...'}
              </Button>
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.backupOnQuit}
                  onChange={(e) => void save({ backupOnQuit: e.target.checked })}
                  disabled={!settings.backupDir}
                />
              }
              label="Back up automatically when EasyGrade quits, and once a day while it stays open"
            />
            <NumberSetting
              label="Snapshots to keep"
              value={settings.backupKeep}
              min={1}
              max={50}
              helper="Older database snapshots are removed after each backup. Scan images are mirrored once, not per snapshot."
              onCommit={(value) => save({ backupKeep: value })}
            />
            <Typography variant="body2" color="text.secondary">
              {settings.lastBackupAt ? `Last backup ${formatDateTime(settings.lastBackupAt)}` : 'No backup yet'}
              {backup && backup.snapshots.length > 0 && newest
                ? ` · ${backup.snapshots.length} snapshot${backup.snapshots.length === 1 ? '' : 's'} (newest ${formatShortDate(newest.createdAt)}, ${formatBytes(newest.bytes)})`
                : ''}
              {backup?.scanBytes !== null && backup?.scanBytes !== undefined ? ` · scans mirror ${formatBytes(backup.scanBytes)}` : ''}
            </Typography>
            <Divider />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="contained" startIcon={<BackupIcon />} onClick={backUpNow} disabled={busy !== null || !settings.backupDir}>
                Back up now
              </Button>
              <Button variant="outlined" color="warning" startIcon={<RestoreIcon />} onClick={() => setRestoreOpen(true)} disabled={busy !== null}>
                Restore from backup...
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Start over
          </Typography>
          <Stack spacing={1.5} alignItems="flex-start">
            <Typography variant="body2" color="text.secondary">
              Clears every section, student, test, result, scan, and setting, for example at the start of a new school year. The current
              database is kept in the data folder in case you change your mind; backups are not touched.
            </Typography>
            <Button variant="outlined" color="error" startIcon={<RestartAltIcon />} onClick={() => setResetOpen(true)} disabled={busy !== null}>
              Reset all data...
            </Button>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            About
          </Typography>
          <Typography variant="body2">EasyGrade {info?.version ?? ''}</Typography>
          {info ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: 'break-all' }}>
              Data location: {info.userDataPath}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" size="small" startIcon={<SystemUpdateAltIcon />} onClick={checkForUpdates} disabled={busy !== null}>
              Check for updates
            </Button>
            <Typography variant="body2" color="text.secondary">
              {describeUpdate(updateState)}
            </Typography>
          </Stack>
        </Paper>
      </Stack>

      <ConfirmDialog
        open={purgePreview !== null}
        title="Purge old page images?"
        message={
          purgePreview ? (
            <>
              This deletes the scanned images of {purgePreview.batchCount} batch{purgePreview.batchCount === 1 ? '' : 'es'} ({purgePreview.pageCount}{' '}
              page{purgePreview.pageCount === 1 ? '' : 's'}) imported before {formatShortDate(purgePreview.cutoff)}, freeing about{' '}
              {formatBytes(purgePreview.bytes)}. Grades, detected answers, and overrides are kept; only the pictures go, so those pages can no
              longer be reviewed visually.
            </>
          ) : null
        }
        confirmLabel="Purge"
        destructive
        busy={busy === 'purge'}
        onClose={() => setPurgePreview(null)}
        onConfirm={purge}
      />

      <ConfirmDialog
        open={restoreOpen}
        title="Restore from a backup?"
        message="You will pick a backup snapshot (easygrade-backup-....db). EasyGrade replaces its current data with that snapshot, copies back any scan images stored beside it, and reloads. The current database is kept next to the new one in the data folder in case you need it."
        confirmLabel="Choose backup..."
        busy={busy === 'restore'}
        onClose={() => setRestoreOpen(false)}
        onConfirm={restore}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Reset all data?"
        message="This removes every section, student, test, result, and scan image, and returns the settings to their defaults. The current database is kept next to the new one in the data folder (easygrade.db.before-reset-...). Backup snapshots are not touched, and a backup can be restored later from this page."
        confirmLabel="Reset all data"
        destructive
        busy={busy === 'reset'}
        onClose={() => setResetOpen(false)}
        onConfirm={reset}
      />
    </>
  )
}

function describeUpdate(state: UpdateState | null): string {
  if (!state) return ''
  if (!state.enabled) {
    return state.disabledReason === 'dev-build'
      ? 'Automatic updates are off for dev builds.'
      : 'Automatic updates are off while running from source.'
  }
  const s = state.status
  switch (s.status) {
    case 'checking':
      return 'Checking...'
    case 'available':
      return `Version ${s.version} is available.`
    case 'downloading':
      return `Downloading version ${s.version ?? ''}...`
    case 'downloaded':
      return `Version ${s.version} is ready to install.`
    case 'error':
      return `Last check failed: ${s.message}`
    case 'not-available':
      return 'Up to date. EasyGrade checks for updates automatically a few times a day.'
    default:
      return 'EasyGrade checks for updates automatically a few times a day.'
  }
}

interface NumberSettingProps {
  label: string
  value: number
  min: number
  max: number
  helper?: string
  onCommit: (value: number) => Promise<boolean>
}

/** A small integer field that saves on blur or Enter and snaps back when the value is rejected. */
function NumberSetting({ label, value, min, max, helper, onCommit }: NumberSettingProps): JSX.Element {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  const commit = (): void => {
    const next = Number(text)
    if (!Number.isInteger(next) || next < min || next > max) {
      setText(String(value))
      return
    }
    if (next === value) return
    void onCommit(next).then((ok) => {
      if (!ok) setText(String(value))
    })
  }

  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      helperText={helper}
      slotProps={{ htmlInput: { min, max, step: 1 } }}
      sx={{ width: 260 }}
    />
  )
}
