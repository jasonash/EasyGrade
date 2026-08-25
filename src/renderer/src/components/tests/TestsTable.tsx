import type { JSX } from 'react'
import { useState, type MouseEvent } from 'react'
import { Chip, IconButton, Menu, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import type { TestSummary } from '@shared/types'
import { formatShortDate } from '@/lib/format'

interface Props {
  tests: TestSummary[]
  showSection?: boolean
  onOpen: (test: TestSummary) => void
  /** Finalized tests open their results on row click; the editor stays in the menu. */
  onResults: (test: TestSummary) => void
  onCopy: (test: TestSummary) => void
  onPrint: (test: TestSummary) => void
  onDelete: (test: TestSummary) => void
}

export function TestsTable({ tests, showSection = false, onOpen, onResults, onCopy, onPrint, onDelete }: Props): JSX.Element {
  const [menu, setMenu] = useState<{ el: HTMLElement; test: TestSummary } | null>(null)
  const closeMenu = (): void => setMenu(null)
  const openMenu = (event: MouseEvent<HTMLElement>, test: TestSummary): void => {
    event.stopPropagation()
    setMenu({ el: event.currentTarget, test })
  }

  return (
    <>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              {showSection ? <TableCell>Section</TableCell> : null}
              <TableCell align="right">Questions</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Printed</TableCell>
              <TableCell>Graded</TableCell>
              <TableCell width={56} />
            </TableRow>
          </TableHead>
          <TableBody>
            {tests.map((test) => (
              <TableRow key={test.id} hover onClick={() => (test.status === 'finalized' ? onResults(test) : onOpen(test))} sx={{ cursor: 'pointer' }}>
                <TableCell>
                  <Typography>{test.title}</Typography>
                </TableCell>
                {showSection ? (
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {test.sectionName}
                    </Typography>
                  </TableCell>
                ) : null}
                <TableCell align="right">{test.questionCount}</TableCell>
                <TableCell>
                  {test.status === 'finalized' ? (
                    <Chip size="small" color="success" variant="outlined" label="Finalized" />
                  ) : (
                    <Chip size="small" variant="outlined" label="Draft" />
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {test.lastPrintedAt ? formatShortDate(test.lastPrintedAt) : ''}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {test.status === 'finalized' ? `${test.resultCount}/${test.activeStudentCount}` : ''}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={(e) => openMenu(e, test)} aria-label="Test actions">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Menu anchorEl={menu?.el} open={Boolean(menu)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menu) onOpen(menu.test)
            closeMenu()
          }}
        >
          {menu?.test.status === 'finalized' ? 'Open test' : 'Edit'}
        </MenuItem>
        <MenuItem
          disabled={menu?.test.status !== 'finalized'}
          onClick={() => {
            if (menu) onResults(menu.test)
            closeMenu()
          }}
        >
          Results
        </MenuItem>
        <MenuItem
          disabled={menu?.test.status !== 'finalized'}
          onClick={() => {
            if (menu) onPrint(menu.test)
            closeMenu()
          }}
        >
          Print...
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) onCopy(menu.test)
            closeMenu()
          }}
        >
          Copy to section...
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) onDelete(menu.test)
            closeMenu()
          }}
          sx={{ color: 'error.main' }}
        >
          Delete
        </MenuItem>
      </Menu>
    </>
  )
}
