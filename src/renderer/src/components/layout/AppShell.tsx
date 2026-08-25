import type { JSX } from 'react'
import { useEffect, type ReactNode } from 'react'
import {
  AppBar,
  Badge,
  Box,
  Drawer,
  FormControl,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Toolbar,
  Typography
} from '@mui/material'
import ClassIcon from '@mui/icons-material/Class'
import QuizIcon from '@mui/icons-material/Quiz'
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner'
import SettingsIcon from '@mui/icons-material/Settings'
import { useUiStore, type Page } from '@/stores/ui.store'
import { useSectionsStore } from '@/stores/sections.store'
import { attentionCount, useScanStore } from '@/stores/scan.store'
import { ALL_YEARS, useSchoolYearFilter } from '@/lib/schoolYear'
import { describeError } from '@/lib/errors'

const DRAWER_WIDTH = 200

interface NavItem {
  page: Page
  label: string
  icon: ReactNode
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { page: 'sections', label: 'Sections', icon: <ClassIcon /> },
  { page: 'tests', label: 'Tests', icon: <QuizIcon /> },
  { page: 'grading', label: 'Grading', icon: <DocumentScannerIcon /> }
]

/** Pages that highlight a given nav item. */
function isNavActive(item: Page, page: Page, editorReturn: 'tests' | 'section-detail', resultsReturn: Page): boolean {
  let effective: Page = page
  if (page === 'test-editor') effective = editorReturn
  else if (page === 'batch-review') effective = 'grading'
  else if (page === 'test-results') effective = resultsReturn === 'section-detail' || resultsReturn === 'student-results' ? 'section-detail' : 'tests'
  else if (page === 'student-results') effective = 'section-detail'
  if (item === 'sections') return effective === 'sections' || effective === 'section-detail'
  return item === effective
}

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const page = useUiStore((s) => s.page)
  const navigate = useUiStore((s) => s.navigate)
  const editorReturn = useUiStore((s) => s.editorReturnPage)
  const resultsReturn = useUiStore((s) => s.resultsReturnPage)
  const toast = useUiStore((s) => s.toast)
  const loadSections = useSectionsStore((s) => s.load)
  const loadBatches = useScanStore((s) => s.load)
  const attention = useScanStore((s) => attentionCount(s.batches))
  const { year, years, setYear } = useSchoolYearFilter()

  // Sections feed the school-year filter, so load them once at startup.
  useEffect(() => {
    void loadSections().catch((err: unknown) => toast('error', describeError(err)))
    void loadBatches().catch(() => undefined)
  }, [loadSections, loadBatches, toast])

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="transparent"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backdropFilter: 'blur(8px)',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default'
        }}
      >
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: 0.3 }}>
            EasyGrade
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {years.length > 0 ? (
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={year}
                displayEmpty
                inputProps={{ 'aria-label': 'School year filter' }}
                onChange={(e) => {
                  void setYear(e.target.value).catch((err: unknown) => toast('error', describeError(err)))
                }}
                sx={{ fontSize: 14 }}
              >
                <MenuItem value={ALL_YEARS}>All years</MenuItem>
                {years.map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.default'
          }
        }}
      >
        <Toolbar variant="dense" />
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <List sx={{ px: 1, pt: 1 }}>
            {NAV_ITEMS.map((item) => (
              <ListItemButton
                key={item.page}
                selected={isNavActive(item.page, page, editorReturn, resultsReturn)}
                onClick={() => navigate(item.page)}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {item.page === 'grading' && attention > 0 ? (
                    <Badge color="warning" badgeContent={attention} max={99}>
                      {item.icon}
                    </Badge>
                  ) : (
                    item.icon
                  )}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
          <Box sx={{ flexGrow: 1 }} />
          <List sx={{ px: 1, pb: 1 }}>
            <ListItemButton
              selected={page === 'settings'}
              onClick={() => navigate('settings')}
              sx={{ borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText primary="Settings" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: 'background.default' }}>
        <Toolbar variant="dense" />
        <Box sx={{ p: 3 }}>{children}</Box>
      </Box>
    </Box>
  )
}
