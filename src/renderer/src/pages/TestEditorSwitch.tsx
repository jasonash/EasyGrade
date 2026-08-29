import type { JSX } from 'react'
import { useEffect } from 'react'
import { Skeleton } from '@mui/material'
import { useTestsStore } from '@/stores/tests.store'
import { useUiStore } from '@/stores/ui.store'
import { TestEditorPage } from './TestEditorPage'
import { AnswerSheetEditorPage } from './AnswerSheetEditorPage'

/** Opens the editor that matches the test's kind. The list normally already knows it; otherwise it loads. */
export function TestEditorSwitch(): JSX.Element {
  const testId = useUiStore((s) => s.selectedTestId)
  const kind = useTestsStore((s) => s.tests.find((t) => t.id === testId)?.kind)
  const load = useTestsStore((s) => s.load)
  useEffect(() => {
    if (kind === undefined && testId !== null) void load().catch(() => undefined)
  }, [kind, testId, load])
  if (kind === undefined) return <Skeleton variant="rounded" height={400} />
  return kind === 'answer_sheet' ? <AnswerSheetEditorPage /> : <TestEditorPage />
}
