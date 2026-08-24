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
  Stack,
  Switch,
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
import { SectionDialog } from '@/components/sections/SectionDialog'
import { ApiCallError } from '@/api'

export function SectionsPage(): JSX.Element {
  const { sections, schoolYears, includeArchived, load, setIncludeArchived, create, update, remove } =
    useSectionsStore()
  const toast = useUiStore((s) => s.toast)

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
        await create(input)
        toast('success', 'Section created')
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

      {sections.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Create a section for each class period, then add students to its roster."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              Create your first section
            </Button>
          }
        />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>School year</TableCell>
                <TableCell align="right">Students</TableCell>
                <TableCell align="right">Tests</TableCell>
                <TableCell width={56} />
              </TableRow>
            </TableHead>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.id} hover>
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
                    <IconButton size="small" onClick={(e) => openMenu(e, section)} aria-label="Section actions">
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
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
        <MenuItem
          onClick={() => menuAnchor && void deleteSection(menuAnchor.section)}
          sx={{ color: 'error.main' }}
        >
          Delete
        </MenuItem>
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

function describe(err: unknown): string {
  if (err instanceof ApiCallError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}