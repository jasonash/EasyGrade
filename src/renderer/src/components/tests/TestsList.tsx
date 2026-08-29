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
import { TestFormDialog, type TestFormValues } from './TestFormDialog'
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
   * it from its empty state. On a section page the section is locked in the
   * dialog, which still asks for the title and the test type.
   */
  newTest: { open: boolean; onOpen: () => void; onClose: () => void }
}

/** The page-level "New Test" button; disabled until a section exists to put the test in. */
export function NewTestButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }): JSX.Element {
  const hasSections = useSectionsStore((s) => s.sections.length > 0)
  return (
    <Button variant="contained" startIcon={<AddIcon />} onClick={onClick} disabled={disabled || !hasSections}>
      New Test
    </Button>
  )
}

export function TestsList({ sectionId, filter, onClearFilter, newTest }: Props): JSX.Element {
  const { tests, loading, load, create, copy, finalize, remove } = useTestsStore()
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

  const createTest = async (values: TestFormValues): Promise<void> => {
    const [targetId] = values.sectionIds
    if (targetId === undefined) return
    try {
      const test = await create(
        values.kind === 'answer_sheet'
          ? { sectionId: targetId, title: values.title, kind: 'answer_sheet', defaultChoiceCount: values.defaultChoiceCount, questionCount: values.questionCount }
          : { sectionId: targetId, title: values.title, kind: 'standard' }
      )
      newTest.onClose()
      openTest(test.id)
    } catch (err) {
      toast('error', describeError(err))
    }
  }

  /** Copy to every chosen section in turn; a single unfinalized copy opens in the editor, anything else stays on the list. */
  const copyTest = async (values: TestFormValues): Promise<void> => {
    if (!copyTarget) return
    const made: number[] = []
    let failure: string | null = null
    for (const targetId of values.sectionIds) {
      try {
        const test = await copy({ id: copyTarget.id, sectionId: targetId, title: values.title })
        made.push(test.id)
        if (values.finalizeNow) await finalize(test.id)
      } catch (err) {
        const target = sections.find((s) => s.id === targetId)
        failure = `${target?.name ?? 'Section'}: ${describeError(err)}`
        break
      }
    }
    if (failure) {
      toast('error', made.length > 0 ? `${failure} (${made.length} ${made.length === 1 ? 'copy' : 'copies'} made before that)` : failure)
      if (made.length === 0) return
    }
    setCopyTarget(null)
    const names = values.sectionIds.slice(0, made.length).map((id) => sections.find((s) => s.id === id)?.name ?? 'section')
    const state = values.finalizeNow ? 'finalized and ready to print' : 'as a new draft'
    if (made.length === 1 && !values.finalizeNow && made[0] !== undefined) {
      toast('success', `Copied to ${names[0]} ${state}`)
      openTest(made[0])
      return
    }
    toast('success', made.length === 1 ? `Copied to ${names[0]}, ${state}` : `Copied to ${made.length} sections, ${state}: ${names.join(', ')}`)
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
        sourceFinalized={copyTarget?.status === 'finalized'}
        description="Each copy is a separate test with its own code, so its sheets and results stay apart."
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
