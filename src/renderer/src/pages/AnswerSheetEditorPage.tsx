import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import PrintIcon from '@mui/icons-material/Print'
import AssessmentIcon from '@mui/icons-material/Assessment'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import type { LabelStyle, Test } from '@shared/types'
import {
  MAX_BUBBLES,
  MAX_INSTRUCTIONS_CHARS,
  MAX_TITLE_CHARS,
  MIN_BUBBLES,
  answerSheetCapacity,
  buildAnswerSheetLayout,
  choiceLabel,
  measureHeader,
  type SheetLayout
} from '@shared/layout'
import { formatQrPayload } from '@shared/codes'
import { DEFAULT_INSTRUCTIONS, DEFAULT_TEST_TITLE, LinkUrlSchema, MAX_LINK_URL_CHARS } from '@shared/schemas'
import { useUiStore } from '@/stores/ui.store'
import { useTestsStore } from '@/stores/tests.store'
import { describeError } from '@/lib/errors'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PageHeader } from '@/components/common/PageHeader'
import { AnswerSheetPreview } from '@/components/editor/AnswerSheetPreview'
import { AttachmentCard } from '@/components/editor/AttachmentCard'
import { PasteKeyDialog } from '@/components/editor/PasteKeyDialog'
import { PrintDialog } from '@/components/print/PrintDialog'

interface EditorRow {
  key: number
  choiceCount: number
  correctChoice: number
  labelStyle: LabelStyle
  countOverridden: boolean
}

interface EditorState {
  title: string
  instructions: string
  linkUrl: string
  defaultChoiceCount: number
  rows: EditorRow[]
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const AUTOSAVE_MS = 800
let nextKey = 1

function fromTest(test: Test): EditorState {
  return {
    title: test.title,
    instructions: test.instructions,
    linkUrl: test.linkUrl ?? '',
    defaultChoiceCount: test.defaultChoiceCount ?? MAX_BUBBLES,
    rows: test.questions.map((q) => ({
      key: nextKey++,
      choiceCount: q.choices.length,
      correctChoice: q.correctChoice,
      labelStyle: q.labelStyle,
      countOverridden: q.countOverridden
    }))
  }
}

function blankRow(count: number): EditorRow {
  return { key: nextKey++, choiceCount: count, correctChoice: 0, labelStyle: 'letters', countOverridden: false }
}

/** Keep a row consistent after its bubble count changes: the key must exist, T/F needs two bubbles. */
function withCount(row: EditorRow, choiceCount: number, defaultCount: number, overridden: boolean): EditorRow {
  return {
    ...row,
    choiceCount,
    countOverridden: overridden && choiceCount !== defaultCount,
    labelStyle: choiceCount === 2 ? row.labelStyle : 'letters',
    correctChoice: Math.min(row.correctChoice, choiceCount - 1)
  }
}

const BUBBLE_BUTTON_SX = { width: 34, height: 34, minWidth: 34, p: 0, borderRadius: '50% !important', border: '1px solid', borderColor: 'divider', ml: '4px !important' } as const

export function AnswerSheetEditorPage(): JSX.Element {
  const testId = useUiStore((s) => s.selectedTestId)
  const closeEditor = useUiStore((s) => s.closeEditor)
  const openTestResults = useUiStore((s) => s.openTestResults)
  const toast = useUiStore((s) => s.toast)
  const { get, updateAnswerSheet, finalize, unlock, load: reloadTests } = useTestsStore()

  const [test, setTest] = useState<Test | null>(null)
  const [state, setState] = useState<EditorState | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [busy, setBusy] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [highlight, setHighlight] = useState<number | null>(null)
  /** A key change on a finalized sheet with results waits for confirmation here. */
  const [pendingKey, setPendingKey] = useState<{ rows: EditorRow[]; description: string } | null>(null)
  /** Shrinking the question count would drop rows whose key was set; confirm first. */
  const [pendingTrim, setPendingTrim] = useState<number | null>(null)

  const stateRef = useRef<EditorState | null>(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const [selectTitle, setSelectTitle] = useState(false)
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
        setSelectTitle(loaded.status === 'draft' && loaded.title === DEFAULT_TEST_TITLE)
      })
      .catch((err: unknown) => {
        toast('error', describeError(err))
        closeEditor()
      })
    return () => {
      cancelled = true
    }
  }, [testId, get, toast, closeEditor])

  useEffect(() => {
    if (!selectTitle || !test || !titleRef.current) return
    titleRef.current.focus()
    titleRef.current.select()
    setSelectTitle(false)
  }, [selectTitle, test])

  const save = useCallback(async (): Promise<Test | null> => {
    const current = stateRef.current
    if (!current || testId === null || !dirtyRef.current) return null
    dirtyRef.current = false
    setSaveState('saving')
    try {
      const saved = await updateAnswerSheet({
        id: testId,
        title: current.title,
        instructions: current.instructions,
        linkUrl: current.linkUrl,
        defaultChoiceCount: current.defaultChoiceCount,
        questions: current.rows.map((r) => ({
          choiceCount: r.choiceCount,
          correctChoice: r.correctChoice,
          labelStyle: r.labelStyle,
          countOverridden: r.countOverridden
        }))
      })
      setTest((prev) => (prev ? { ...prev, ...saved } : saved))
      setSaveState(dirtyRef.current ? 'dirty' : 'saved')
      return saved
    } catch (err) {
      dirtyRef.current = true
      setSaveState('error')
      toast('error', describeError(err))
      return null
    }
  }, [testId, updateAnswerSheet, toast])

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

  /** Apply a change and schedule the autosave. Finalized sheets only ever send the key and the link this way. */
  const edit = (next: EditorState): void => {
    stateRef.current = next
    setState(next)
    dirtyRef.current = true
    setSaveState('dirty')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void save()
    }, AUTOSAVE_MS)
  }

  /** Key edits on a finalized sheet save right away so the regrade happens while the teacher is looking. */
  const commitRows = async (rows: EditorRow[]): Promise<void> => {
    if (!state || !test) return
    if (!readOnly) {
      edit({ ...state, rows })
      return
    }
    const next = { ...state, rows }
    // save() reads the ref, and the re-render that refreshes it has not happened yet.
    stateRef.current = next
    setState(next)
    dirtyRef.current = true
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    const saved = await save()
    if (saved) toast('success', test.resultCount > 0 ? `Key updated. ${test.resultCount} results will regrade.` : 'Answer key updated')
    else setState(fromTest(test))
  }

  const changeKey = (rows: EditorRow[], description: string): void => {
    if (!test) return
    if (readOnly && test.resultCount > 0) {
      setPendingKey({ rows, description })
      return
    }
    void commitRows(rows)
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
      toast('success', 'Answer sheet finalized. Layout is locked and ready to print.')
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
      toast('info', 'Answer sheet unlocked. Finalize again before printing.')
    } catch (err) {
      toast('error', describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const header = useMemo(() => (state ? measureHeader(state.title, state.instructions) : null), [state])
  const capacity = useMemo(() => (state ? answerSheetCapacity(state.defaultChoiceCount).capacity : 0), [state])
  const layout = useMemo<SheetLayout | null>(() => {
    if (!state) return null
    try {
      return buildAnswerSheetLayout(
        state.rows.map((r) => r.choiceCount),
        state.defaultChoiceCount
      )
    } catch {
      return null
    }
  }, [state])

  if (!test || !state || !header) {
    return <Skeleton variant="rounded" height={400} />
  }

  const linkValid = LinkUrlSchema.safeParse(state.linkUrl).success
  const validationProblem =
    state.title.trim() === ''
      ? 'Title is required'
      : state.rows.length === 0
        ? 'Add at least one question'
        : state.rows.length > capacity
          ? `Only ${capacity} questions fit with ${state.defaultChoiceCount} bubbles each`
          : !linkValid
            ? 'The link must start with http:// or https://'
            : (header.problems[0] ?? null)
  const canFinalize = validationProblem === null && !busy && saveState !== 'error'
  const saveLabel = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving...', error: 'Save failed' }[saveState]
  const finalizeHint = validationProblem ?? 'Lock the layout so sheets can be printed'
  const fitColor = state.rows.length > capacity ? 'error.main' : state.rows.length === capacity ? 'warning.main' : 'text.secondary'

  const setDefaultCount = (next: number): void => {
    const rows = state.rows.map((r) => withCount(r, r.countOverridden ? Math.min(r.choiceCount, next) : next, next, r.countOverridden))
    edit({ ...state, defaultChoiceCount: next, rows })
  }

  const setQuestionCount = (next: number, confirmed = false): void => {
    if (next > state.rows.length) {
      edit({ ...state, rows: [...state.rows, ...Array.from({ length: next - state.rows.length }, () => blankRow(state.defaultChoiceCount))] })
      return
    }
    if (next === state.rows.length) return
    const trimmed = state.rows.slice(next)
    if (!confirmed && trimmed.some((r) => r.correctChoice !== 0)) {
      setPendingTrim(next)
      return
    }
    setPendingTrim(null)
    edit({ ...state, rows: state.rows.slice(0, next) })
  }

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
        chips={
          <>
            <Chip size="small" variant="outlined" label="Answer sheet" />
            {readOnly ? <Chip size="small" icon={<LockIcon />} label="Finalized" color="success" variant="outlined" /> : null}
          </>
        }
        subtitle={
          <span aria-live="polite">
            {test.sectionName} · Code {test.code} · {readOnly ? `Finalized, layout v${test.layoutVersion}` : saveLabel}
            {saveState === 'error' ? <Chip size="small" color="error" variant="outlined" label="Retry" onClick={retrySave} sx={{ ml: 1 }} /> : null}
          </span>
        }
        actions={
          readOnly ? (
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
              <Tooltip title={`Up to ${capacity} questions fit on one page with ${state.defaultChoiceCount} bubbles each`}>
                <Typography variant="body2" sx={{ color: fitColor, fontVariantNumeric: 'tabular-nums', minWidth: 120, textAlign: 'right' }}>
                  {state.rows.length} of {capacity} questions
                </Typography>
              </Tooltip>
              <Tooltip title={finalizeHint}>
                <span>
                  <Button variant="contained" startIcon={<LockIcon />} onClick={() => void doFinalize()} disabled={!canFinalize}>
                    Finalize
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Finalize the answer sheet to print it">
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
          The layout is locked. The answer key and the link stay editable
          {test.resultCount > 0 ? `; changing the key regrades ${test.resultCount} existing results` : ''}. Unlock to change the title, instructions, or
          bubbles; printed sheets will need to be reprinted after you finalize again.
        </Alert>
      ) : null}
      {!readOnly && validationProblem !== null && state.title.trim() !== '' ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Before finalizing: {validationProblem}
        </Alert>
      ) : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={2}>
          <TextField
            label="Instructions"
            value={state.instructions}
            onChange={(e) => edit({ ...state, instructions: e.target.value.replace(/[\r\n]+/g, ' ').slice(0, MAX_INSTRUCTIONS_CHARS) })}
            onFocus={(e) => {
              if (!readOnly && state.instructions === DEFAULT_INSTRUCTIONS) e.target.select()
            }}
            size="small"
            fullWidth
            placeholder={DEFAULT_INSTRUCTIONS}
            helperText={`${state.instructions.length}/${MAX_INSTRUCTIONS_CHARS}. Optional, printed above the bubbles.`}
            slotProps={{ input: { readOnly } }}
          />
          <TextField
            label="Link to the test"
            value={state.linkUrl}
            onChange={(e) => edit({ ...state, linkUrl: e.target.value.replace(/\s+/g, '').slice(0, MAX_LINK_URL_CHARS) })}
            size="small"
            fullWidth
            placeholder="https://docs.google.com/document/d/..."
            error={!linkValid}
            helperText={linkValid ? 'Optional. A Google Doc or any web link to the test itself, so you can find it again later.' : 'The link must start with http:// or https://'}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Open in your browser">
                      <span>
                        <IconButton
                          size="small"
                          edge="end"
                          disabled={state.linkUrl === '' || !linkValid}
                          onClick={() => window.open(state.linkUrl, '_blank')}
                          aria-label="Open link"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                )
              }
            }}
          />

          <AttachmentCard
            test={test}
            onChanged={(updated) => setTest((prev) => (prev ? { ...prev, attachment: updated.attachment, updatedAt: updated.updatedAt } : updated))}
          />

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 190 }} disabled={readOnly}>
                <InputLabel id="bubbles-label">Bubbles per question</InputLabel>
                <Select labelId="bubbles-label" label="Bubbles per question" value={state.defaultChoiceCount} onChange={(e) => setDefaultCount(Number(e.target.value))}>
                  {Array.from({ length: MAX_BUBBLES - MIN_BUBBLES + 1 }, (_, i) => i + MIN_BUBBLES).map((n) => (
                    <MenuItem key={n} value={n}>
                      {n} (A to {String.fromCharCode(64 + n)})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }} disabled={readOnly}>
                <InputLabel id="count-label">Questions</InputLabel>
                <Select labelId="count-label" label="Questions" value={Math.min(state.rows.length, capacity)} onChange={(e) => setQuestionCount(Number(e.target.value))}>
                  {Array.from({ length: capacity }, (_, i) => i + 1).map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ flexGrow: 1 }} />
              <Button variant="outlined" startIcon={<ContentPasteIcon />} onClick={() => setPasteOpen(true)} disabled={state.rows.length === 0}>
                Paste key...
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Each row can use fewer bubbles than the default (for example 2 for true/false). Rows you change by hand keep their count when the default
              changes.
            </Typography>
          </Paper>

          <Paper variant="outlined">
            <Table size="small" aria-label="Answer key">
              <TableHead>
                <TableRow>
                  <TableCell width={56}>#</TableCell>
                  <TableCell width={110}>Bubbles</TableCell>
                  <TableCell width={72}>Style</TableCell>
                  <TableCell>Correct answer</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.rows.map((row, index) => (
                  <TableRow key={row.key} hover onMouseEnter={() => setHighlight(index)} onMouseLeave={() => setHighlight((h) => (h === index ? null : h))}>
                    <TableCell sx={{ fontWeight: 600 }}>{index + 1}.</TableCell>
                    <TableCell>
                      <Select
                        native
                        size="small"
                        value={row.choiceCount}
                        disabled={readOnly}
                        onChange={(e) => {
                          const rows = state.rows.map((r, i) => (i === index ? withCount(r, Number(e.target.value), state.defaultChoiceCount, true) : r))
                          edit({ ...state, rows })
                        }}
                        inputProps={{ 'aria-label': `Bubbles for question ${index + 1}` }}
                        sx={{ minWidth: 72 }}
                      >
                        {Array.from({ length: state.defaultChoiceCount - MIN_BUBBLES + 1 }, (_, i) => i + MIN_BUBBLES).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      {row.choiceCount === 2 ? (
                        <Tooltip title={row.labelStyle === 'true_false' ? 'Bubbles read T and F' : 'Bubbles read A and B; click for T/F'}>
                          <span>
                            <ToggleButton
                              value="tf"
                              size="small"
                              selected={row.labelStyle === 'true_false'}
                              disabled={readOnly}
                              onChange={() => {
                                const rows = state.rows.map((r, i) => (i === index ? { ...r, labelStyle: r.labelStyle === 'true_false' ? ('letters' as const) : ('true_false' as const) } : r))
                                edit({ ...state, rows })
                              }}
                              aria-label={`True/false style for question ${index + 1}`}
                              sx={{ px: 1, py: 0.25, lineHeight: 1.2 }}
                            >
                              T/F
                            </ToggleButton>
                          </span>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        color="primary"
                        value={String(row.correctChoice)}
                        onChange={(_, next: string | null) => {
                          if (next === null) return
                          const choice = Number(next)
                          const rows = state.rows.map((r, i) => (i === index ? { ...r, correctChoice: choice } : r))
                          changeKey(rows, `Question ${index + 1}'s answer becomes ${choiceLabel(choice, row.labelStyle)}.`)
                        }}
                        aria-label={`Correct answer for question ${index + 1}`}
                        sx={{ gap: 0 }}
                      >
                        {Array.from({ length: row.choiceCount }, (_, c) => (
                          <ToggleButton key={c} value={String(c)} sx={BUBBLE_BUTTON_SX} aria-label={`${choiceLabel(c, row.labelStyle)} is correct for question ${index + 1}`}>
                            {choiceLabel(c, row.labelStyle)}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Stack>

        <Box sx={{ position: { md: 'sticky' }, top: { md: 64 } }}>
          <AnswerSheetPreview
            sectionName={test.sectionName}
            code={formatQrPayload({ testCode: test.code, studentCode: null, layoutVersion: test.layoutVersion })}
            header={header}
            layout={layout}
            labelStyles={state.rows.map((r) => r.labelStyle)}
            answerKey={state.rows.map((r) => r.correctChoice)}
            highlight={highlight}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
            Blank-sheet preview with the key shaded in. Printed sheets have empty bubbles; personalized ones print the student name instead of the boxes.
          </Typography>
        </Box>
      </Box>

      <PasteKeyDialog
        open={pasteOpen}
        rows={state.rows.map((r) => ({ choiceCount: r.choiceCount, labelStyle: r.labelStyle }))}
        onClose={() => setPasteOpen(false)}
        onApply={(answers) => {
          setPasteOpen(false)
          const rows = state.rows.map((r, i) => {
            const a = answers[i]
            return a === null || a === undefined ? r : { ...r, correctChoice: a }
          })
          const changed = rows.filter((r, i) => r.correctChoice !== state.rows[i]?.correctChoice).length
          changeKey(rows, `${changed} answer${changed === 1 ? '' : 's'} will change.`)
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
        message={pendingKey ? `${pendingKey.description} ${test.resultCount} graded result${test.resultCount === 1 ? '' : 's'} will be rescored against the new key.` : ''}
        confirmLabel="Change key"
        onClose={() => setPendingKey(null)}
        onConfirm={() => {
          const rows = pendingKey?.rows
          setPendingKey(null)
          if (rows) void commitRows(rows)
        }}
      />

      <ConfirmDialog
        open={pendingTrim !== null}
        title="Remove questions?"
        message={
          pendingTrim !== null
            ? `Questions ${pendingTrim + 1} to ${state.rows.length} will be removed, including answers you have set for them.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        onClose={() => setPendingTrim(null)}
        onConfirm={() => {
          if (pendingTrim !== null) setQuestionCount(pendingTrim, true)
        }}
      />

      <ConfirmDialog
        open={unlockOpen}
        title="Unlock this answer sheet?"
        message="You will be able to change the bubbles and question count again. Any sheets already printed use the old layout and should be reprinted after you finalize the new version."
        confirmLabel="Unlock"
        busy={busy}
        onClose={() => setUnlockOpen(false)}
        onConfirm={() => void doUnlock()}
      />
    </>
  )
}
