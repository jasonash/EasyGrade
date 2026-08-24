import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography
} from '@mui/material'
import type { AppInfo, ThemeMode } from '@shared/types'
import { api, unwrap } from '@/api'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { PageHeader } from '@/components/common/PageHeader'

export function SettingsPage(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const toast = useUiStore((s) => s.toast)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void unwrap(api.app.info())
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  const setTheme = async (mode: ThemeMode): Promise<void> => {
    try {
      await update({ theme: mode })
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not save setting')
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <FormControl>
            <FormLabel>Appearance</FormLabel>
            <RadioGroup
              row
              value={settings.theme}
              onChange={(e) => void setTheme(e.target.value === 'light' ? 'light' : 'dark')}
            >
              <FormControlLabel value="dark" control={<Radio />} label="Dark" />
              <FormControlLabel value="light" control={<Radio />} label="Light" />
            </RadioGroup>
          </FormControl>
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
        </Paper>
      </Stack>
    </>
  )
}