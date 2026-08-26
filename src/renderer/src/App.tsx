import type { JSX } from 'react'
import { useEffect, useMemo } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { TEXT_SIZE_ZOOM } from '@shared/schemas'
import { api } from '@/api'
import { buildTheme } from '@/theme'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { AppShell } from '@/components/layout/AppShell'
import { Toasts } from '@/components/common/Toasts'
import { UpdateNotification } from '@/components/common/UpdateNotification'
import { SectionsPage } from '@/pages/SectionsPage'
import { SectionDetailPage } from '@/pages/SectionDetailPage'
import { TestsPage } from '@/pages/TestsPage'
import { TestEditorPage } from '@/pages/TestEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { GradingPage } from '@/pages/GradingPage'
import { BatchReviewPage } from '@/pages/BatchReviewPage'
import { TestResultsPage } from '@/pages/TestResultsPage'
import { StudentResultsPage } from '@/pages/StudentResultsPage'

export function App(): JSX.Element {
  const page = useUiStore((s) => s.page)
  const theme = useSettingsStore((s) => s.settings.theme)
  const textSize = useSettingsStore((s) => s.settings.textSize)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => {
    void loadSettings().catch(() => undefined)
  }, [loadSettings])

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
        {page === 'test-editor' ? <TestEditorPage /> : null}
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
