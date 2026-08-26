import { createTheme, type Theme } from '@mui/material/styles'
import type { ThemeMode } from '@shared/types'

/**
 * Dark is the default; palette chosen for comfortable, low-glare contrast.
 * The light palette defines the same semantic colours in a calmer register
 * so chips, badges and alerts keep their meaning (and pass 4.5:1) in both.
 */
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
          divider: 'rgba(255,255,255,0.08)',
          // Disabled labels stay readable (5.3:1) while still looking disabled.
          action: { disabled: 'rgba(255,255,255,0.5)' }
        }
      : {
          mode: 'light',
          background: { default: '#f4f5f7', paper: '#ffffff' },
          primary: { main: '#3d6fd8' },
          secondary: { main: '#4f8a2b' },
          error: { main: '#c53030' },
          warning: { main: '#a35200' },
          info: { main: '#0369a1' },
          success: { main: '#2f855a' },
          text: { primary: '#1f2430', secondary: '#5b6472' },
          divider: 'rgba(0,0,0,0.10)',
          action: { disabled: 'rgba(0,0,0,0.45)' }
        },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      // One step up from MUI's default: helper text, captions and table
      // headers are what a teacher reads most, so they must not be tiny.
      fontSize: 15,
      caption: { fontSize: '0.8rem' }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontVariantNumeric: 'tabular-nums' }
        }
      },
      MuiPaper: { defaultProps: { elevation: 0 } },
      MuiButton: { defaultProps: { disableElevation: true } },
      // disableElevation removes the contained button's focus shadow, and the
      // default focus overlay is a faint tint, so draw one clear ring for every
      // button-like control (buttons, icon buttons, nav items, tabs, toggles).
      MuiButtonBase: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&.Mui-focusVisible': {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: 2
            }
          })
        }
      },
      MuiTableRow: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&:focus-visible': {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: -2
            }
          })
        }
      },
      MuiInputBase: {
        styleOverrides: {
          input: {
            '&::placeholder': { opacity: 0.7 }
          }
        }
      },
      MuiFormHelperText: {
        styleOverrides: {
          root: { fontSize: '0.8rem' }
        }
      },
      // 36px targets for the row menus and remove-choice buttons.
      MuiIconButton: {
        styleOverrides: {
          sizeSmall: { padding: 8 }
        }
      }
    }
  })
}
