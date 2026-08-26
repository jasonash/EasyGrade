import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Button, Skeleton } from '@mui/material'
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
import { PrintDialog } from '@/components/print/PrintDialog'

interface Props {
  /** Restrict to one section (section detail tab); otherwise show every visible test. */
  sectionId?: number
  /** Extra filter for the global list (school year, toolbar). */
  filter?: (test: TestSummary) => boolean
  /** Present while the toolbar filters are narrowing the list; shown as a Clear filters action when nothing matches. */
  onClearFilter?: () => void
  /**
   * The New Test dialog is opened from the page header, so the page owns its
   * open state and renders `NewTestButton` there; the list only asks to open
   * it from its empty state.
   */
  newTest: { open: boolean; onOpen: () => void; onClose: () => void }
}

/** The page-level "New Test" button; disabled until a section exists to put the test in. */
export function NewTestButton({ onClick }: { onClick: () => void }): JSX.Element {
  const hasSections = useSectionsStore((s) => s.sections.length > 0)
  return (
    <Button variant="contained" startIcon={<AddIcon />} onClick={onClick} disabled={!hasSections}>
      New Test
    </Button>
  )
}

export function TestsList({ sectionId, filter, onClearFilter, newTest }: Props): JSX.Element {
  const { tests, loading, load, create, copy, remove } = useTestsStore()
  const sections = useSectionsStore((s) => s.sections)
  const toast = useUiStore((s) => s.toast)
  const openTest = useUiStore((s) => s.openTest)
  const openTestResults = useUiStore((s) => s.openTestResults)

  const [copyTarget, setCopyTarget] = useState<TestSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TestSummary | null>(null)
  const [printTarget, setPrintTarget] = useState<TestSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load().catch((err: unknown) => toast('error', describeError(err)))
  }, [load, toast])

  const inScope = tests.filter((t) => sectionId === undefined || t.sectionId === sectionId)
  const visible = inScope.filter((t) => !filter || filter(t))

  const createTest = async (values: { sectionId: number; title: string }): Promise<void> => {
    try {
      const test = await create(values)
      newTest.onClose()
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

  return (
    <>
      {loading && tests.length === 0 ? (
        <Skeleton variant="rounded" height={160} />
      ) : visible.length === 0 && inScope.length > 0 ? (
        <EmptyState
          title="No tests match"
          description={
            onClearFilter
              ? 'Try another section, status, or search, or change the school year in the top bar.'
              : 'Change the school year in the top bar to see tests from other years.'
          }
          action={
            onClearFilter ? (
              <Button variant="outlined" onClick={onClearFilter}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No tests yet"
          description={
            sections.length === 0
              ? 'Create a section first, then add a test to it.'
              : 'Create a test, add up to ten questions, and finalize it when the fit meter is green.'
          }
          action={sections.length > 0 ? <NewTestButton onClick={newTest.onOpen} /> : undefined}
        />
      ) : (
        <TestsTable
          tests={visible}
          showSection={sectionId === undefined}
          onOpen={(t) => openTest(t.id)}
          onResults={(t) => openTestResults(t.id)}
          onCopy={setCopyTarget}
          onPrint={setPrintTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <TestFormDialog
        open={newTest.open}
        mode="create"
        sections={sections}
        sectionId={sectionId ?? null}
        lockSection={sectionId !== undefined}
        onClose={newTest.onClose}
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

      <PrintDialog
        open={printTarget !== null}
        test={printTarget}
        onClose={() => setPrintTarget(null)}
        onPrinted={() => void load()}
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
