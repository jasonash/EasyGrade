import { createTheme, type Theme } from '@mui/material/styles'
import type { ThemeMode } from '@shared/types'

/** Dark is the default; palette chosen for comfortable, low-glare contrast. */
export function buildTheme(mode: ThemeMode): Theme {
  const dark = mode === 'dark'
  return createTheme({
    palette: dark
      ? {
          mode: 'dark',
          background: { default: '#14171c', paper: '#1c2027' },
          primary: { main: '#7aa2f7' },
          secondary: { main: '#9ece6a' },
          error: { main: '#f7768e' },
          warning: { main: '#e0af68' },
          info: { main: '#7dcfff' },
          success: { main: '#9ece6a' },
          text: { primary: '#d6dae2', secondary: '#9aa3b2' },
          divider: 'rgba(255,255,255,0.08)'
        }
      : {
          mode: 'light',
          background: { default: '#f4f5f7', paper: '#ffffff' },
          primary: { main: '#3d6fd8' },
          secondary: { main: '#4f8a2b' },
          text: { primary: '#1f2430', secondary: '#5b6472' }
        },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      fontSize: 14
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontVariantNumeric: 'tabular-nums' }
        }
      },
      MuiPaper: { defaultProps: { elevation: 0 } },
      MuiButton: { defaultProps: { disableElevation: true } }
    }
  })
}
