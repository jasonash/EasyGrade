import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Button, Skeleton, Stack } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import type { TestSummary } from '@shared/types'
import { useTestsStore } from '@/stores/tests.store'
import { useSectionsStore } from '@/stores/sections.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { TestsTable } from './TestsTable'
import { TestFormDialog } from './TestFormDialog'

interface Props {
  /** Restrict to one section (section detail tab); otherwise show every visible test. */
  sectionId?: number
  /** Extra filter for the global list (school year). */
  filter?: (test: TestSummary) => boolean
}

export function TestsList({ sectionId, filter }: Props): JSX.Element {
  const { tests, loading, load, create, copy, remove } = useTestsStore()
  const sections = useSectionsStore((s) => s.sections)
  const toast = useUiStore((s) => s.toast)
  const openTest = useUiStore((s) => s.openTest)

  const [newOpen, setNewOpen] = useState(false)
  const [copyTarget, setCopyTarget] = useState<TestSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TestSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load().catch((err: unknown) => toast('error', describeError(err)))
  }, [load, toast])

  const visible = tests.filter((t) => (sectionId === undefined || t.sectionId === sectionId) && (!filter || filter(t)))

  const createTest = async (values: { sectionId: number; title: string }): Promise<void> => {
    try {
      const test = await create(values)
      setNewOpen(false)
      openTest(test.id)
    } catch (err) {
      toast('error', describeError(err))
    }
  }

  const copyTest = async (values: { sectionId: number; title: string }): Promise<void> => {
    if (!copyTarget) return
    try {
      const test = await copy({ id: copyTarget.id, sectionId: values.sectionId, title: values.title })
      const target = sections.find((s) => s.id === values.sectionId)
      toast('success', `Copied to ${target?.name ?? 'section'} as a new draft`)
      setCopyTarget(null)
      openTest(test.id)
    } catch (err) {
      toast('error', describeError(err))
    }
  }

  const deleteTest = async (): Promise<void> => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await remove(deleteTarget.id)
      toast('success', 'Test deleted')
      setDeleteTarget(null)
    } catch (err) {
      toast('error', describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const newButton = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)} disabled={sections.length === 0}>
      New Test
    </Button>
  )

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        {newButton}
      </Stack>

      {loading && tests.length === 0 ? (
        <Skeleton variant="rounded" height={160} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No tests yet"
          description={
            sections.length === 0
              ? 'Create a section first, then add a test to it.'
              : 'Create a test, add up to ten questions, and finalize it when the fit meter is green.'
          }
          action={sections.length > 0 ? newButton : undefined}
        />
      ) : (
        <TestsTable
          tests={visible}
          showSection={sectionId === undefined}
          onOpen={(t) => openTest(t.id)}
          onCopy={setCopyTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <TestFormDialog
        open={newOpen}
        mode="create"
        sections={sections}
        sectionId={sectionId ?? null}
        lockSection={sectionId !== undefined}
        onClose={() => setNewOpen(false)}
        onSubmit={createTest}
      />

      <TestFormDialog
        open={copyTarget !== null}
        mode="copy"
        sections={sections}
        sectionId={copyTarget?.sectionId ?? null}
        initialTitle={copyTarget?.title ?? ''}
        description="The copy becomes a new draft with its own code and answer key."
        onClose={() => setCopyTarget(null)}
        onSubmit={copyTest}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete test?"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" and ${deleteTarget.resultCount > 0 ? `its ${deleteTarget.resultCount} graded results ` : ''}will be permanently removed.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteTest()}
      />
    </>
  )
}
