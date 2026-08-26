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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/Upload'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import DownloadIcon from '@mui/icons-material/Download'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import type { ImportRow, Section, Student } from '@shared/types'
import { api, unwrap } from '@/api'
import { useStudentsStore } from '@/stores/students.store'
import { useSectionsStore } from '@/stores/sections.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Code } from '@/components/common/Code'
import { StudentDialog, type StudentFormValues } from './StudentDialog'
import { MoveStudentDialog } from './MoveStudentDialog'
import { ImportDialog, type ImportSource } from './ImportDialog'

interface Props {
  section: Section
}

export function RosterTab({ section }: Props): JSX.Element {
  const { students, loading, includeInactive, load, setIncludeInactive } = useStudentsStore()
  const store = useStudentsStore
  const sections = useSectionsStore((s) => s.sections)
  const toast = useUiStore((s) => s.toast)
  const openStudentResults = useUiStore((s) => s.openStudentResults)

  const [studentDialog, setStudentDialog] = useState<{ open: boolean; student: Student | null }>({
    open: false,
    student: null
  })
  const [moveTarget, setMoveTarget] = useState<Student | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
  const [importSource, setImportSource] = useState<ImportSource | null>(null)
  const [menu, setMenu] = useState<{ el: HTMLElement; student: Student } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load(section.id).catch((err: unknown) => toast('error', describeError(err)))
  }, [section.id, load, toast])

  const run = async (action: () => Promise<void>, success?: string): Promise<boolean> => {
    setBusy(true)
    try {
      await action()
      if (success) toast('success', success)
      return true
    } catch (err) {
      toast('error', describeError(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const submitStudent = async (values: StudentFormValues): Promise<void> => {
    const editing = studentDialog.student
    const ok = await run(async () => {
      if (editing) {
        await store.getState().update({ id: editing.id, ...values })
      } else {
        await store.getState().create({ sectionId: section.id, ...values })
      }
    }, editing ? 'Student updated' : 'Student added')
    if (ok) setStudentDialog({ open: false, student: null })
  }

  const reactivate = (student: Student): Promise<boolean> =>
    run(async () => {
      await store.getState().reactivate(student.id)
    }, 'Student reactivated')

  const toggleActive = async (student: Student): Promise<void> => {
    if (!student.active) {
      await reactivate(student)
      return
    }
    // Deactivating hides the row, so offer the way back on the toast itself.
    const ok = await run(async () => {
      await store.getState().deactivate(student.id)
    })
    if (ok) {
      toast('success', `${student.firstName} ${student.lastName} deactivated`, {
        label: 'Undo',
        onClick: () => void reactivate(student)
      })
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    const ok = await run(() => store.getState().remove(deleteTarget.id), 'Student deleted')
    if (ok) setDeleteTarget(null)
  }

  const moveStudent = async (sectionId: number): Promise<void> => {
    if (!moveTarget) return
    const target = sections.find((s) => s.id === sectionId)
    const ok = await run(
      () => store.getState().move({ id: moveTarget.id, sectionId }).then(() => undefined),
      `Moved to ${target?.name ?? 'section'}`
    )
    if (ok) setMoveTarget(null)
  }

  const importCsv = async (): Promise<void> => {
    await run(async () => {
      const file = await unwrap(api.students.pickImportFile())
      if (file) setImportSource({ kind: 'file', name: file.name, text: file.text })
    })
  }

  const saveTemplate = async (): Promise<void> => {
    await run(async () => {
      const path = await unwrap(api.students.saveTemplate())
      if (path) toast('success', `Template saved to ${path}`)
    })
  }

  const commitImport = async (rows: ImportRow[]): Promise<number> => {
    const result = await store.getState().importCommit({
      sectionId: section.id,
      rows: rows.map((r) => ({ lastName: r.lastName, firstName: r.firstName, studentNumber: r.studentNumber }))
    })
    toast('success', `Imported ${result.created} ${result.created === 1 ? 'student' : 'students'}`)
    setImportSource(null)
    return result.created
  }

  const openMenu = (event: MouseEvent<HTMLElement>, student: Student): void =>
    setMenu({ el: event.currentTarget, student })
  const closeMenu = (): void => setMenu(null)

  const activeCount = students.filter((s) => s.active).length
  const showTable = students.length > 0

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h6">Roster ({activeCount})</Typography>
        <Stack direction="row" spacing={1} sx={{ ml: 'auto' }} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setStudentDialog({ open: true, student: null })}
            disabled={busy}
          >
            Add Student
          </Button>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => void importCsv()} disabled={busy}>
            Import CSV
          </Button>
          <Button
            variant="outlined"
            startIcon={<ContentPasteIcon />}
            onClick={() => setImportSource({ kind: 'paste' })}
            disabled={busy}
          >
            Paste from Sheet
          </Button>
          <Tooltip title="Save the CSV template">
            <span>
              <IconButton onClick={() => void saveTemplate()} disabled={busy} aria-label="Save CSV template">
                <DownloadIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {loading && !showTable ? (
        <Skeleton variant="rounded" height={160} />
      ) : !showTable ? (
        <EmptyState
          title={includeInactive ? 'No students in this section' : 'No active students'}
          description="Add students one at a time, import the CSV template, or paste rows from a spreadsheet."
          action={
            <Stack direction="row" spacing={1} justifyContent="center">
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setStudentDialog({ open: true, student: null })}
              >
                Add Student
              </Button>
              <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => void importCsv()}>
                Import CSV
              </Button>
            </Stack>
          }
        />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Last</TableCell>
                <TableCell>First</TableCell>
                <TableCell>Student #</TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Status</TableCell>
                <TableCell width={56} />
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id} hover sx={{ opacity: student.active ? 1 : 0.6 }}>
                  <TableCell>{student.lastName}</TableCell>
                  <TableCell>{student.firstName}</TableCell>
                  <TableCell>{student.studentNumber ?? ''}</TableCell>
                  <TableCell>
                    <Code>{student.code}</Code>
                  </TableCell>
                  <TableCell>
                    {student.active ? (
                      <Chip size="small" color="success" variant="outlined" label="Active" />
                    ) : (
                      <Chip size="small" variant="outlined" label="Inactive" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={(e) => openMenu(e, student)} aria-label="Student actions">
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
              checked={includeInactive}
              onChange={(e) => {
                void setIncludeInactive(e.target.checked).catch((err: unknown) => toast('error', describeError(err)))
              }}
            />
          }
          label="Show inactive"
        />
      </Stack>

      <Menu anchorEl={menu?.el} open={Boolean(menu)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menu) openStudentResults(menu.student.id)
            closeMenu()
          }}
        >
          Results{menu && menu.student.resultCount > 0 ? ` (${menu.student.resultCount})` : ''}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setStudentDialog({ open: true, student: menu.student })
            closeMenu()
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setMoveTarget(menu.student)
            closeMenu()
          }}
        >
          Move to section...
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) void toggleActive(menu.student)
            closeMenu()
          }}
        >
          {menu?.student.active ? 'Deactivate' : 'Reactivate'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setDeleteTarget(menu.student)
            closeMenu()
          }}
          sx={{ color: 'error.main' }}
        >
          Delete
        </MenuItem>
      </Menu>

      <StudentDialog
        open={studentDialog.open}
        student={studentDialog.student}
        onClose={() => setStudentDialog({ open: false, student: null })}
        onSubmit={submitStudent}
      />

      <MoveStudentDialog
        open={moveTarget !== null}
        student={moveTarget}
        sections={sections}
        onClose={() => setMoveTarget(null)}
        onMove={moveStudent}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete student?"
        message={
          deleteTarget
            ? `${deleteTarget.firstName} ${deleteTarget.lastName} will be removed from this roster. ` +
              'Students with graded results cannot be deleted; deactivate them instead.'
            : ''
        }
        confirmLabel="Delete"
        destructive
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />

      <ImportDialog
        open={importSource !== null}
        source={importSource ?? { kind: 'paste' }}
        onClose={() => setImportSource(null)}
        onPreview={(text) => store.getState().importPreview({ sectionId: section.id, text })}
        onCommit={commitImport}
      />
    </>
  )
}
