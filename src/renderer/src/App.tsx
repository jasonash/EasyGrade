import type { JSX } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { TEXT_SIZE_ZOOM } from '@shared/schemas'
import { api } from '@/api'
import { buildTheme } from '@/theme'
import { activeNavItem, useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { useSettingsStore } from '@/stores/settings.store'
import { AppShell } from '@/components/layout/AppShell'
import { Toasts } from '@/components/common/Toasts'
import { UpdateNotification } from '@/components/common/UpdateNotification'
import { SectionsPage } from '@/pages/SectionsPage'
import { SectionDetailPage } from '@/pages/SectionDetailPage'
import { TestsPage } from '@/pages/TestsPage'
import { TestEditorSwitch } from '@/pages/TestEditorSwitch'
import { SettingsPage } from '@/pages/SettingsPage'
import { GradingPage } from '@/pages/GradingPage'
import { BatchReviewPage } from '@/pages/BatchReviewPage'
import { TestResultsPage } from '@/pages/TestResultsPage'
import { StudentResultsPage } from '@/pages/StudentResultsPage'

export function App(): JSX.Element {
  const page = useUiStore((s) => s.page)
  const active = useUiStore(activeNavItem)
  const navigate = useUiStore((s) => s.navigate)
  const toast = useUiStore((s) => s.toast)
  const theme = useSettingsStore((s) => s.settings.theme)
  const textSize = useSettingsStore((s) => s.settings.textSize)
  const lastPage = useSettingsStore((s) => s.settings.lastPage)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const loadSettings = useSettingsStore((s) => s.load)
  const updateSettings = useSettingsStore((s) => s.update)
  const restored = useRef(false)

  useEffect(() => {
    void loadSettings().catch((err: unknown) => toast('error', describeError(err)))
  }, [loadSettings, toast])

  // Reopen the rail page that was showing when the app last closed, once,
  // before the persist effect below can overwrite the stored value.
  useEffect(() => {
    if (!settingsLoaded || restored.current) return
    restored.current = true
    if (lastPage !== null) navigate(lastPage)
  }, [settingsLoaded, lastPage, navigate])

  useEffect(() => {
    if (!restored.current || active === 'settings' || active === lastPage) return
    void updateSettings({ lastPage: active }).catch((err: unknown) => toast('error', describeError(err)))
  }, [active, lastPage, updateSettings, toast])

  // Text size scales the whole window. Wait for the stored value so the
  // default does not briefly override the saved zoom on launch.
  useEffect(() => {
    if (settingsLoaded) api.app.setZoomFactor(TEXT_SIZE_ZOOM[textSize])
  }, [settingsLoaded, textSize])

  const muiTheme = useMemo(() => buildTheme(theme), [theme])

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <AppShell>
        {page === 'sections' ? <SectionsPage /> : null}
        {page === 'section-detail' ? <SectionDetailPage /> : null}
        {page === 'tests' ? <TestsPage /> : null}
        {page === 'test-editor' ? <TestEditorSwitch /> : null}
        {page === 'grading' ? <GradingPage /> : null}
        {page === 'batch-review' ? <BatchReviewPage /> : null}
        {page === 'test-results' ? <TestResultsPage /> : null}
        {page === 'student-results' ? <StudentResultsPage /> : null}
        {page === 'settings' ? <SettingsPage /> : null}
      </AppShell>
      <Toasts />
      <UpdateNotification />
    </ThemeProvider>
  )
}
