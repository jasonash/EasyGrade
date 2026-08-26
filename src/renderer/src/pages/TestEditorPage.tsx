import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, Skeleton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import PrintIcon from '@mui/icons-material/Print'
import AssessmentIcon from '@mui/icons-material/Assessment'
import type { Test } from '@shared/types'
import { MAX_INSTRUCTIONS_CHARS, MAX_QUESTIONS, MAX_TITLE_CHARS, measureTest } from '@shared/layout'
import { formatQrPayload } from '@shared/codes'
import { firstFinalizeProblem } from '@shared/test-validation'
import { DEFAULT_TEST_TITLE } from '@shared/schemas'
import { CHOICE_LETTERS } from '@shared/layout'
import { useUiStore } from '@/stores/ui.store'
import { useTestsStore } from '@/stores/tests.store'
import { describeError } from '@/lib/errors'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PageHeader } from '@/components/common/PageHeader'
import { FitMeter } from '@/components/editor/FitMeter'
import { AiQuestionsDialog } from '@/components/editor/AiQuestionsDialog'
import { QuestionCard, type EditorQuestion } from '@/components/editor/QuestionCard'
import { SheetPreview } from '@/components/editor/SheetPreview'
import { PrintDialog } from '@/components/print/PrintDialog'

interface EditorState {
  title: string
  instructions: string
  questions: EditorQuestion[]
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const AUTOSAVE_MS = 800
let nextKey = 1

function fromTest(test: Test): EditorState {
  return {
    title: test.title,
    instructions: test.instructions,
    questions: test.questions.map((q) => ({ key: nextKey++, stem: q.stem, choices: [...q.choices], correctChoice: q.correctChoice }))
  }
}

/** An untouched question card, as created by "Question" or on a new test. */
function isBlankQuestion(q: EditorQuestion): boolean {
  return q.stem.trim() === '' && q.choices.every((c) => c.trim() === '')
}

function blankQuestion(): EditorQuestion {
  return { key: nextKey++, stem: '', choices: ['', '', '', ''], correctChoice: 0 }
}

export function TestEditorPage(): JSX.Element {
  const testId = useUiStore((s) => s.selectedTestId)
  const closeEditor = useUiStore((s) => s.closeEditor)
  const openTestResults = useUiStore((s) => s.openTestResults)
  const toast = useUiStore((s) => s.toast)
  const { get, update, updateKey, finalize, unlock, load: reloadTests } = useTestsStore()

  const [test, setTest] = useState<Test | null>(null)
  const [state, setState] = useState<EditorState | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [busy, setBusy] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  /** A key change on a finalized test with results waits for confirmation here. */
  const [pendingKey, setPendingKey] = useState<{ index: number; correctChoice: number } | null>(null)

  const stateRef = useRef<EditorState | null>(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  /** Set when a freshly created test loads; the effect below focuses the title once it is on screen. */
  const [selectTitle, setSelectTitle] = useState(false)
  /** The question most recently added and how to reveal it; its card acts on mount, so the value can simply stay until the next add. */
  const [reveal, setReveal] = useState<{ key: number; mode: 'scroll' | 'focus' } | null>(null)
  stateRef.current = state

  const readOnly = test?.status === 'finalized'

  useEffect(() => {
    if (testId === null) return
    let cancelled = false
    void get(testId)
      .then((loaded) => {
        if (cancelled) return
        setTest(loaded)
        setState(fromTest(loaded))
        dirtyRef.current = false
        setSaveState('saved')
        // A test made without a title (New Test from a section) starts with the
        // placeholder selected, so the first keystroke replaces it.
        setSelectTitle(loaded.status === 'draft' && loaded.title === DEFAULT_TEST_TITLE && loaded.questions.every((q) => q.stem === ''))
      })
      .catch((err: unknown) => {
        toast('error', describeError(err))
        closeEditor()
      })
    return () => {
      cancelled = true
    }
  }, [testId, get, toast, closeEditor])

  // The title field only exists once the skeleton is gone, so focus after that commit.
  useEffect(() => {
    if (!selectTitle || !test || !titleRef.current) return
    titleRef.current.focus()
    titleRef.current.select()
    setSelectTitle(false)
  }, [selectTitle, test])

  const save = useCallback(async (): Promise<void> => {
    const current = stateRef.current
    if (!current || testId === null || !dirtyRef.current) return
    dirtyRef.current = false
    setSaveState('saving')
    try {
      const saved = await update({
        id: testId,
        title: current.title,
        instructions: current.instructions,
        questions: current.questions.map((q) => ({ stem: q.stem, choices: q.choices, correctChoice: q.correctChoice }))
      })
      setTest((prev) => (prev ? { ...prev, ...saved } : saved))
      setSaveState(dirtyRef.current ? 'dirty' : 'saved')
    } catch (err) {
      dirtyRef.current = true
      setSaveState('error')
      toast('error', describeError(err))
    }
  }, [testId, update, toast])

  // Flush a pending save when leaving the editor or when the window goes away
  // (quit, reload) before the autosave timer fires.
  useEffect(() => {
    const flush = (): void => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      void save()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [save])

  const retrySave = (): void => {
    dirtyRef.current = true
    void save()
  }

  const edit = (next: EditorState): void => {
    setState(next)
    if (readOnly) return
    dirtyRef.current = true
    setSaveState('dirty')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void save()
    }, AUTOSAVE_MS)
  }

  const measure = useMemo(
    () =>
      state
        ? measureTest({
            title: state.title,
            instructions: state.instructions,
            questions: state.questions.map((q) => ({ stem: q.stem, choices: q.choices }))
          })
        : null,
    [state]
  )

  const validationProblem = useMemo(() => (state ? firstFinalizeProblem(state) : null), [state])

  const changeKey = async (index: number, correctChoice: number): Promise<void> => {
    if (!state || !test) return
    const questions = state.questions.map((q, i) => (i === index ? { ...q, correctChoice } : q))
    if (!readOnly) {
      edit({ ...state, questions })
      return
    }
    setPendingKey(null)
    setState({ ...state, questions })
    try {
      const updated = await updateKey({ id: test.id, correctChoices: questions.map((q) => q.correctChoice) })
      setTest(updated)
      toast('success', test.resultCount > 0 ? `Key updated. ${test.resultCount} results will regrade.` : 'Answer key updated')
    } catch (err) {
      toast('error', describeError(err))
      setState(fromTest(test))
    }
  }

  const doFinalize = async (): Promise<void> => {
    if (!test) return
    setBusy(true)
    try {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      await save()
      const finalized = await finalize(test.id)
      setTest(finalized)
      setState(fromTest(finalized))
      toast('success', 'Test finalized. Layout is locked and ready to print.')
    } catch (err) {
      toast('error', describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const doUnlock = async (): Promise<void> => {
    if (!test) return
    setBusy(true)
    try {
      const unlocked = await unlock(test.id)
      setTest(unlocked)
      setState(fromTest(unlocked))
      setUnlockOpen(false)
      toast('info', 'Test unlocked. Finalize again before printing.')
    } catch (err) {
      toast('error', describeError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!test || !state || !measure) {
    return <Skeleton variant="rounded" height={400} />
  }

  const canFinalize = measure.fits && validationProblem === null && !busy && saveState !== 'error'
  const saveLabel = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving...', error: 'Save failed' }[saveState]
  const finalizeHint = !measure.fits ? 'Fix the fit problems first' : (validationProblem ?? 'Lock the layout so sheets can be printed')
  // A brand-new test is one blank card; nagging about it before anything is typed helps nobody.
  const started = state.questions.some((q) => !isBlankQuestion(q))

  return (
    <>
      <PageHeader
        onBack={closeEditor}
        backLabel="Back to tests"
        titleSlot={
          <TextField
            variant="standard"
            value={state.title}
            onChange={(e) => edit({ ...state, title: e.target.value.replace(/[\r\n]+/g, ' ').slice(0, MAX_TITLE_CHARS) })}
            placeholder="Test title"
            inputRef={titleRef}
            sx={{ flexGrow: 1, minWidth: 240 }}
            slotProps={{ input: { readOnly, sx: { fontSize: 22, fontWeight: 600 } } }}
            inputProps={{ 'aria-label': 'Test title' }}
          />
        }
        chips={readOnly ? <Chip size="small" icon={<LockIcon />} label="Finalized" color="success" variant="outlined" /> : null}
        subtitle={
          <span aria-live="polite">
            {test.sectionName} · Code {test.code} · {readOnly ? `Finalized, layout v${test.layoutVersion}` : saveLabel}
            {!readOnly && saveState === 'error' ? (
              <Chip size="small" color="error" variant="outlined" label="Retry" onClick={retrySave} sx={{ ml: 1 }} />
            ) : null}
          </span>
        }
        actions={
          readOnly ? (
            // Locked: printing sheets is the next step, so it is the one primary button.
            <>
              <Button variant="outlined" startIcon={<LockOpenIcon />} onClick={() => setUnlockOpen(true)} disabled={busy}>
                Unlock
              </Button>
              <Button variant="outlined" startIcon={<AssessmentIcon />} onClick={() => openTestResults(test.id)}>
                Results{test.resultCount > 0 ? ` (${test.resultCount})` : ''}
              </Button>
              <Button variant="contained" startIcon={<PrintIcon />} disabled={busy} onClick={() => setPrintOpen(true)}>
                Print
              </Button>
            </>
          ) : (
            <>
              <FitMeter measure={measure} />
              <Tooltip title={finalizeHint}>
                <span>
                  <Button variant="contained" startIcon={<LockIcon />} onClick={() => void doFinalize()} disabled={!canFinalize}>
                    Finalize
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Finalize the test to print sheets">
                <span>
                  <Button variant="outlined" startIcon={<PrintIcon />} disabled>
                    Print
                  </Button>
                </span>
              </Tooltip>
            </>
          )
        }
      />

      {readOnly ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Text is locked. The answer key stays editable
          {test.resultCount > 0 ? `; changing it regrades ${test.resultCount} existing results` : ''}. Unlock to edit
          questions; printed sheets will need to be reprinted after you finalize again.
        </Alert>
      ) : null}
      {!measure.fits && measure.problems.length > 0 ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {measure.problems.join('. ')}
        </Alert>
      ) : null}
      {!readOnly && measure.fits && validationProblem !== null && started ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Before finalizing: {validationProblem}
        </Alert>
      ) : null}

      {/* The preview is live feedback while typing, so it stays beside the questions from the md breakpoint (the app's 1024 minimum) up. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={2}>
          <TextField
            label="Instructions"
            value={state.instructions}
            onChange={(e) => edit({ ...state, instructions: e.target.value.replace(/[\r\n]+/g, ' ').slice(0, MAX_INSTRUCTIONS_CHARS) })}
            size="small"
            fullWidth
            placeholder="Fill in one bubble completely for each question."
            helperText={`${state.instructions.length}/${MAX_INSTRUCTIONS_CHARS}. Optional, printed above the questions.`}
            slotProps={{ input: { readOnly } }}
          />

          {state.questions.map((question, index) => (
            <QuestionCard
              key={question.key}
              index={index}
              count={state.questions.length}
              question={question}
              measure={measure.questions[index]}
              readOnly={readOnly}
              reveal={reveal?.key === question.key ? reveal.mode : undefined}
              onChange={(next) => {
                if (readOnly) {
                  if (next.correctChoice === question.correctChoice) return
                  // Results already graded against the old key: confirm before regrading them.
                  if (test.resultCount > 0) setPendingKey({ index, correctChoice: next.correctChoice })
                  else void changeKey(index, next.correctChoice)
                  return
                }
                edit({ ...state, questions: state.questions.map((q, i) => (i === index ? next : q)) })
              }}
              onMove={(direction) => {
                const target = index + direction
                if (target < 0 || target >= state.questions.length) return
                const questions = [...state.questions]
                const [moved] = questions.splice(index, 1)
                if (moved) questions.splice(target, 0, moved)
                edit({ ...state, questions })
              }}
              onRemove={() => edit({ ...state, questions: state.questions.filter((_, i) => i !== index) })}
            />
          ))}

          {readOnly ? null : (
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                disabled={state.questions.length >= MAX_QUESTIONS}
                onClick={() => {
                  const added = blankQuestion()
                  setReveal({ key: added.key, mode: 'focus' })
                  edit({ ...state, questions: [...state.questions, added] })
                }}
              >
                Question
              </Button>
              <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => setAiOpen(true)}>
                Write with AI...
              </Button>
              <Typography variant="body2" color="text.secondary">
                {state.questions.length} of {MAX_QUESTIONS}
              </Typography>
            </Stack>
          )}
        </Stack>

        <Box sx={{ position: { md: 'sticky' }, top: { md: 64 } }}>
          <SheetPreview
            title={state.title}
            sectionName={test.sectionName}
            code={formatQrPayload({ testCode: test.code, studentCode: null, layoutVersion: test.layoutVersion })}
            measure={measure}
            choiceCounts={state.questions.map((q) => q.choices.length)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
            Blank-sheet preview. Personalized sheets print the student name instead of the boxes.
          </Typography>
        </Box>
      </Box>

      <AiQuestionsDialog
        open={aiOpen}
        existingCount={state.questions.filter((q) => !isBlankQuestion(q)).length}
        topic={state.title}
        onClose={() => setAiOpen(false)}
        onImport={(imported, mode) => {
          const kept = mode === 'replace' ? [] : state.questions.filter((q) => !isBlankQuestion(q))
          const added = imported.map((q) => ({ key: nextKey++, stem: q.stem, choices: [...q.choices], correctChoice: q.correctChoice }))
          const first = added[0]
          if (first) setReveal({ key: first.key, mode: 'scroll' })
          edit({ ...state, questions: [...kept, ...added].slice(0, MAX_QUESTIONS) })
          toast('success', `${added.length} question${added.length === 1 ? '' : 's'} added. Check the answers and the fit meter.`)
        }}
      />
      <PrintDialog
        open={printOpen}
        test={test}
        onClose={() => setPrintOpen(false)}
        onPrinted={(outcome) => {
          if (outcome.printRun) setTest((prev) => (prev ? { ...prev, lastPrintedAt: outcome.printRun?.printedAt ?? prev.lastPrintedAt } : prev))
          void reloadTests()
        }}
      />

      <ConfirmDialog
        open={pendingKey !== null}
        title="Change the answer key?"
        message={
          pendingKey
            ? `Question ${pendingKey.index + 1}'s answer becomes ${CHOICE_LETTERS[pendingKey.correctChoice] ?? pendingKey.correctChoice + 1}. ` +
              `${test.resultCount} graded result${test.resultCount === 1 ? '' : 's'} will be rescored against the new key.`
            : ''
        }
        confirmLabel="Change key"
        onClose={() => setPendingKey(null)}
        onConfirm={() => {
          if (pendingKey) void changeKey(pendingKey.index, pendingKey.correctChoice)
        }}
      />

      <ConfirmDialog
        open={unlockOpen}
        title="Unlock this test?"
        message="You will be able to edit questions again. Any sheets already printed use the old layout and should be reprinted after you finalize the new version."
        confirmLabel="Unlock"
        busy={busy}
        onClose={() => setUnlockOpen(false)}
        onConfirm={() => void doUnlock()}
      />
    </>
  )
}
