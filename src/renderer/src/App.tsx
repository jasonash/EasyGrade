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
import { SettingsPage } from '@/pages/SettingsPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

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
        {page === 'tests' ? (
          <PlaceholderPage title="Tests" subtitle="Create and print single-page tests" phase="Phase 3" />
        ) : null}
        {page === 'grading' ? (
          <PlaceholderPage title="Grading" subtitle="Import scans and review results" phase="Phase 5" />
        ) : null}
        {page === 'settings' ? <SettingsPage /> : null}
      </AppShell>
      <Toasts />
    </ThemeProvider>
  )
}
