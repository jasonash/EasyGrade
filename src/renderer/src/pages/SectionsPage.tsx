import type { JSX } from 'react'
import { useEffect, useState, type MouseEvent } from 'react'
import {
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import type { Section } from '@shared/types'
import type { SectionInput } from '@shared/schemas'
import { useSectionsStore } from '@/stores/sections.store'
import { useUiStore } from '@/stores/ui.store'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { ClickableRow } from '@/components/common/ClickableRow'
import { SectionDialog } from '@/components/sections/SectionDialog'
import { useSchoolYearFilter } from '@/lib/schoolYear'
import { describeError as describe } from '@/lib/errors'

/** Only an empty section can be deleted; the service refuses otherwise. */
function canDelete(section: Section): boolean {
  return section.studentCount === 0 && section.testCount === 0
}

function deleteHint(section: Section): string {
  const parts: string[] = []
  if (section.studentCount > 0) parts.push(`${section.studentCount} ${section.studentCount === 1 ? 'student' : 'students'}`)
  if (section.testCount > 0) parts.push(`${section.testCount} ${section.testCount === 1 ? 'test' : 'tests'}`)
  return `Still has ${parts.join(' and ')}. Archive it instead, or remove them first.`
}

export function SectionsPage(): JSX.Element {
  const { sections, schoolYears, loaded, includeArchived, load, setIncludeArchived, create, update, remove } =
    useSectionsStore()
  const toast = useUiStore((s) => s.toast)
  const openSection = useUiStore((s) => s.openSection)
  const { year, matches } = useSchoolYearFilter()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Section | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; section: Section } | null>(null)

  useEffect(() => {
    void load().catch((err: unknown) => toast('error', describe(err)))
  }, [load, toast])

  const openCreate = (): void => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openMenu = (event: MouseEvent<HTMLElement>, section: Section): void => {
    setMenuAnchor({ el: event.currentTarget, section })
  }
  const closeMenu = (): void => setMenuAnchor(null)

  const submit = async (input: SectionInput): Promise<void> => {
    try {
      if (editing) {
        await update({ id: editing.id, name: input.name, schoolYear: input.schoolYear })
        toast('success', 'Section updated')
      } else {
        // The roster is the next thing to fill in, so land there.
        const section = await create(input)
        toast('success', 'Section created. Add students to its roster.')
        setDialogOpen(false)
        openSection(section.id, 'roster')
        return
      }
      setDialogOpen(false)
    } catch (err) {
      toast('error', describe(err))
    }
  }

  const toggleArchived = async (section: Section): Promise<void> => {
    closeMenu()
    try {
      await update({ id: section.id, archived: !section.archived })
      toast('success', section.archived ? 'Section restored' : 'Section archived')
    } catch (err) {
      toast('error', describe(err))
    }
  }

  const deleteSection = async (section: Section): Promise<void> => {
    closeMenu()
    try {
      await remove(section.id)
      toast('success', 'Section deleted')
    } catch (err) {
      toast('error', describe(err))
    }
  }

  const visible = sections.filter(matches)
  const hiddenByYear = sections.length - visible.length

  return (
    <>
      <PageHeader
        title="Sections"
        subtitle="Class periods and their rosters"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New Section
          </Button>
        }
      />

      {!loaded ? (
        <Skeleton variant="rounded" height={160} />
      ) : sections.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Create a section for each class period, then add students to its roster."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              Create your first section
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={`No sections for ${year}`}
          description="Change the school year in the top bar to see other sections."
        />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell width={160}>School year</TableCell>
                <TableCell align="right" width={110}>
                  Students
                </TableCell>
                <TableCell align="right" width={110}>
                  Tests
                </TableCell>
                <TableCell width={56} />
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((section) => (
                <ClickableRow key={section.id} onOpen={() => openSection(section.id)} label={`Open ${section.name}`}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography>{section.name}</Typography>
                      {section.archived ? <Chip size="small" label="Archived" /> : null}
                    </Stack>
                  </TableCell>
                  <TableCell>{section.schoolYear}</TableCell>
                  <TableCell align="right">{section.studentCount}</TableCell>
                  <TableCell align="right">{section.testCount}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        openMenu(e, section)
                      }}
                      aria-label="Section actions"
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={2} sx={{ mt: 2 }}>
        {hiddenByYear > 0 && visible.length > 0 ? (
          <Typography variant="caption" color="text.secondary">
            {hiddenByYear} hidden by the school year filter
          </Typography>
        ) : null}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={includeArchived}
              onChange={(e) => void setIncludeArchived(e.target.checked)}
            />
          }
          label="Show archived"
        />
      </Stack>

      <Menu anchorEl={menuAnchor?.el} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menuAnchor) openSection(menuAnchor.section.id, 'roster')
            closeMenu()
          }}
        >
          Open roster
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuAnchor) {
              setEditing(menuAnchor.section)
              setDialogOpen(true)
            }
            closeMenu()
          }}
        >
          Rename
        </MenuItem>
        <MenuItem onClick={() => menuAnchor && void toggleArchived(menuAnchor.section)}>
          {menuAnchor?.section.archived ? 'Restore' : 'Archive'}
        </MenuItem>
        <Tooltip
          title={menuAnchor && !canDelete(menuAnchor.section) ? deleteHint(menuAnchor.section) : ''}
          placement="left"
        >
          <span>
            <MenuItem
              onClick={() => menuAnchor && void deleteSection(menuAnchor.section)}
              disabled={menuAnchor !== null && !canDelete(menuAnchor.section)}
              sx={{ color: 'error.main' }}
            >
              Delete
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>

      <SectionDialog
        open={dialogOpen}
        section={editing}
        schoolYears={schoolYears}
        onClose={() => setDialogOpen(false)}
        onSubmit={submit}
      />
    </>
  )
}

