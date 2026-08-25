import type { JSX } from 'react'
import { useEffect, useMemo } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { buildTheme } from '@/theme'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { AppShell } from '@/components/layout/AppShell'
import { Toasts } from '@/components/common/Toasts'
import { SectionsPage } from '@/pages/SectionsPage'
import { SectionDetailPage } from '@/pages/SectionDetailPage'
import { TestsPage } from '@/pages/TestsPage'
import { TestEditorPage } from '@/pages/TestEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { GradingPage } from '@/pages/GradingPage'

export function App(): JSX.Element {
  const page = useUiStore((s) => s.page)
  const theme = useSettingsStore((s) => s.settings.theme)
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => {
    void loadSettings().catch(() => undefined)
  }, [loadSettings])

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
        {page === 'settings' ? <SettingsPage /> : null}
      </AppShell>
      <Toasts />
    </ThemeProvider>
  )
}
