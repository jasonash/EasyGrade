import type { JSX } from 'react'
import type { ReactNode } from 'react'
import {
  AppBar,
  Badge,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography
} from '@mui/material'
import ClassIcon from '@mui/icons-material/Class'
import QuizIcon from '@mui/icons-material/Quiz'
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner'
import SettingsIcon from '@mui/icons-material/Settings'
import { useUiStore, type Page } from '@/stores/ui.store'

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

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const page = useUiStore((s) => s.page)
  const navigate = useUiStore((s) => s.navigate)

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
                selected={page === item.page}
                onClick={() => navigate(item.page)}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {item.badge ? (
                    <Badge color="warning" badgeContent={item.badge}>
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