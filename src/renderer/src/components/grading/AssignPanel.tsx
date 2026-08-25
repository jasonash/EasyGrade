import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import type { GradeResult, ScanPageDetail, Student, Test } from '@shared/types'
import { CHOICE_LETTERS } from '@shared/layout'
import { scanImageUrl } from '@shared/scan-url'
import { api, unwrap } from '@/api'
import { useTestsStore } from '@/stores/tests.store'
import { useSectionsStore } from '@/stores/sections.store'
import { useScanStore } from '@/stores/scan.store'
import { useUiStore } from '@/stores/ui.store'
import { gradingApi } from '@/lib/grading-api'
import { describeError } from '@/lib/errors'
import { canReadBubbles, choiceLetter, describePage, flagLabel } from '@/lib/grading'
import { ConflictDialog } from './ConflictDialog'

interface Props {
  page: ScanPageDetail
  /** The page already has a result and the teacher is moving it to someone else. */
  reassign?: boolean
  onAssigned: (page: ScanPageDetail) => void
  onDiscarded: (page: ScanPageDetail) => void
  onCancel?: () => void
}

interface RosterOption {
  student: Student
  sectionName: string
}

const BLANK = 'blank'

/**
 * Attach a page to a test and student. Handles every "needs a person"
 * case: blank sheets (with the handwritten name crops), roster mismatches,
 * unreadable QR codes, unknown tests, stale layouts, import-time conflicts
 * (keep or replace), and pages that were never aligned (answers by hand).
 */
export function AssignPanel({ page, reassign = false, onAssigned, onDiscarded, onCancel }: Props): JSX.Element {
  const tests = useTestsStore((s) => s.tests)
  const loadTests = useTestsStore((s) => s.load)
  const sections = useSectionsStore((s) => s.sections)
  const assignPage = useScanStore((s) => s.assignPage)
  const discardPage = useScanStore((s) => s.discardPage)
  const resolveConflict = useScanStore((s) => s.resolveConflict)
  const toast = useUiStore((s) => s.toast)

  const finalized = useMemo(() => tests.filter((t) => t.status === 'finalized'), [tests])
  const readable = canReadBubbles(page)
  const importConflict = page.reason === 'conflict' && page.bucket === 'needs_assignment' && !reassign

  const [testId, setTestId] = useState<number | null>(page.testId)
  const [test, setTest] = useState<Test | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [roster, setRoster] = useState<RosterOption[]>([])
  const [studentId, setStudentId] = useState<number | null>(page.studentId)
  const [manual, setManual] = useState(!readable)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<{ existing: GradeResult; existingPage: ScanPageDetail | null } | null>(null)
  const [existing, setExisting] = useState<GradeResult | null>(null)
  const [existingPage, setExistingPage] = useState<ScanPageDetail | null>(null)
  const [someoneElse, setSomeoneElse] = useState(false)

  useEffect(() => {
    if (tests.length === 0) void loadTests().catch((err: unknown) => toast('error', describeError(err)))
  }, [tests.length, loadTests, toast])

  // Default to the only finalized test when the page did not name one.
  useEffect(() => {
    if (testId === null && finalized.length === 1) setTestId(finalized[0]?.id ?? null)
  }, [testId, finalized])

  // Load the chosen test (questions, section) and reset the manual answers.
  useEffect(() => {
    if (testId === null) {
      setTest(null)
      return
    }
    let cancelled = false
    void unwrap(api.tests.get(testId))
      .then((loaded) => {
        if (cancelled) return
        setTest(loaded)
        const fromPage = page.detected && page.testId === loaded.id ? page.detected : null
        setAnswers(loaded.questions.map((_, q) => (fromPage?.[q]?.state === 'filled' ? (fromPage[q]?.choice ?? null) : null)))
      })
      .catch((err: unknown) => {
        if (!cancelled) toast('error', describeError(err))
      })
    return () => {
      cancelled = true
    }
  }, [testId, page.detected, page.testId, toast])

  // Roster: the test's section, or every section.
  useEffect(() => {
    const sectionId = test?.sectionId ?? null
    if (!showAll && sectionId === null) {
      setRoster([])
      return
    }
    let cancelled = false
    const targets = showAll ? sections.map((s) => ({ id: s.id, name: s.name })) : [{ id: sectionId ?? 0, name: test?.sectionName ?? '' }]
    void Promise.all(targets.map((s) => unwrap(api.students.listBySection(s.id, true)).then((list) => list.map((student) => ({ student, sectionName: s.name })))))
      .then((lists) => {
        if (!cancelled) setRoster(lists.flat())
      })
      .catch((err: unknown) => {
        if (!cancelled) toast('error', describeError(err))
      })
    return () => {
      cancelled = true
    }
  }, [test?.sectionId, test?.sectionName, showAll, sections, toast])

  // Import-time conflict: find the result this page collides with.
  useEffect(() => {
    if (!importConflict || page.studentId === null || page.testId === null) return
    let cancelled = false
    void gradingApi
      .resultsForStudent(page.studentId)
      .then(async (view) => {
        const row = view.rows.find((r) => r.result.testId === page.testId)
        if (cancelled || !row) return
        setExisting(row.result)
        if (row.page) setExistingPage(await unwrap(api.scan.getPage(row.page.id)))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [importConflict, page.studentId, page.testId])

  const selectedOption = roster.find((o) => o.student.id === studentId) ?? null
  const rosterMissingSelection = studentId !== null && roster.length > 0 && !selectedOption

  const detectedSummary = useMemo(() => {
    if (!page.detected || !test || page.testId !== test.id) return null
    const filled = page.detected.filter((r) => r.state === 'filled').length
    const flagged = page.detected.filter((r) => r.state !== 'filled').map((r) => flagLabel({ q: r.q, kind: r.state === 'filled' ? 'low_confidence' : r.state }))
    return { filled, total: page.detected.length, flagged }
  }, [page.detected, page.testId, test])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast('error', describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const assign = (replace = false): void => {
    if (testId === null || studentId === null) return
    void run(async () => {
      const outcome = await assignPage({ pageId: page.id, testId, studentId, replace, answers: manual ? answers : undefined })
      if (outcome.status === 'conflict') {
        setConflict({ existing: outcome.existing, existingPage: outcome.existingPage })
        return
      }
      setConflict(null)
      toast('success', `Graded for ${outcome.page.studentName ?? 'student'}: ${outcome.page.result?.correctCount ?? 0}/${outcome.page.result?.possibleCount ?? 0}`)
      onAssigned(outcome.page)
    })
  }

  const discard = (): void => {
    void run(async () => {
      const updated = await discardPage(page.id)
      toast('info', 'Page discarded')
      onDiscarded(updated)
    })
  }

  const resolve = (action: 'keep' | 'replace'): void => {
    void run(async () => {
      const updated = await resolveConflict({ pageId: page.id, action })
      toast('success', action === 'keep' ? 'Kept the existing result; this page was discarded' : 'Replaced the earlier result with this page')
      if (action === 'keep') onDiscarded(updated)
      else onAssigned(updated)
    })
  }

  const description = describePage(page)
  const canAssign = testId !== null && studentId !== null && test !== null && !busy && (!manual || answers.length === test.questions.length)

  if (importConflict && !someoneElse) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">{description}</Alert>
        {existing ? (
          <Stack direction="row" spacing={2}>
            <ScoreCard title="Existing result" thumb={existingPage?.thumbPath ?? null} version={existingPage?.processedAt ?? null} score={`${existing.correctCount}/${existing.possibleCount}`} />
            <ScoreCard
              title="This page"
              thumb={page.thumbPath}
              version={page.processedAt}
              score={detectedSummary ? `${detectedSummary.filled}/${detectedSummary.total} bubbles filled` : 'Not read'}
            />
          </Stack>
        ) : null}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={() => resolve('keep')} disabled={busy}>
            Keep existing
          </Button>
          <Button variant="contained" color="warning" onClick={() => resolve('replace')} disabled={busy}>
            Replace with this page
          </Button>
          <Button onClick={() => setSomeoneElse(true)} disabled={busy}>
            This is someone else's sheet...
          </Button>
        </Stack>
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      {description && !reassign ? <Alert severity={page.bucket === 'not_a_sheet' || page.bucket === 'discarded' ? 'info' : 'warning'}>{description}</Alert> : null}
      {reassign ? <Alert severity="info">Choose who this sheet belongs to. The current result moves with it.</Alert> : null}

      {page.crops.name_box || page.crops.section_box ? (
        <Stack direction="row" spacing={2}>
          {page.crops.name_box ? <CropCard label="Name" src={scanImageUrl(page.crops.name_box, page.processedAt)} flex={3} /> : null}
          {page.crops.section_box ? <CropCard label="Section" src={scanImageUrl(page.crops.section_box, page.processedAt)} flex={1} /> : null}
        </Stack>
      ) : null}

      <FormControl size="small" fullWidth>
        <InputLabel id="assign-test-label">Test</InputLabel>
        <Select
          labelId="assign-test-label"
          label="Test"
          value={testId ?? ''}
          onChange={(e) => {
            const next = Number(e.target.value)
            setTestId(Number.isFinite(next) && next > 0 ? next : null)
            setStudentId(null)
          }}
        >
          {finalized.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.title}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {t.sectionName}
              </Typography>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {finalized.length === 0 ? <Alert severity="info">No finalized tests. Finalize a test before grading sheets for it.</Alert> : null}

      <Autocomplete
        size="small"
        options={roster}
        value={selectedOption}
        onChange={(_, option) => setStudentId(option?.student.id ?? null)}
        groupBy={showAll ? (o) => o.sectionName : undefined}
        getOptionLabel={(o) => `${o.student.lastName}, ${o.student.firstName}${o.student.studentNumber ? ` (${o.student.studentNumber})` : ''}`}
        isOptionEqualToValue={(a, b) => a.student.id === b.student.id}
        renderOption={(props, o) => {
          const { key, ...rest } = props
          return (
            <li key={key} {...rest}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {o.student.lastName}, {o.student.firstName}
                </Typography>
                {o.student.studentNumber ? (
                  <Typography variant="caption" color="text.secondary">
                    {o.student.studentNumber}
                  </Typography>
                ) : null}
                {!o.student.active ? <Chip size="small" label="Inactive" /> : null}
              </Stack>
            </li>
          )
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Student"
            placeholder={test ? `Search ${test.sectionName}...` : 'Choose a test first'}
            helperText={rosterMissingSelection ? 'The named student is not in this section. Turn on "Show all sections" or pick someone else.' : undefined}
          />
        )}
        disabled={testId === null}
        noOptionsText={test ? 'No matching student' : 'Choose a test first'}
      />
      <FormControlLabel control={<Switch size="small" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />} label="Show all sections" />

      {test ? (
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Answers
            </Typography>
            <FormControlLabel
              control={<Switch size="small" checked={manual} onChange={(e) => setManual(e.target.checked)} disabled={!readable} />}
              label="Enter by hand"
            />
          </Stack>
          {manual ? (
            <Stack spacing={0.5}>
              {test.questions.map((question, q) => (
                <Stack key={question.id} direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ width: 32 }}>
                    Q{q + 1}
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={answers[q] === null || answers[q] === undefined ? BLANK : String(answers[q])}
                    onChange={(_, next: string | null) => {
                      if (next === null) return
                      setAnswers((prev) => prev.map((a, i) => (i === q ? (next === BLANK ? null : Number(next)) : a)))
                    }}
                    aria-label={`Answer for question ${q + 1}`}
                  >
                    {question.choices.map((_, c) => (
                      <ToggleButton key={c} value={String(c)} sx={{ px: 1.25, py: 0.25, minWidth: 34 }}>
                        {CHOICE_LETTERS[c]}
                      </ToggleButton>
                    ))}
                    <ToggleButton value={BLANK} sx={{ px: 1.25, py: 0.25 }}>
                      Blank
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
              ))}
            </Stack>
          ) : detectedSummary ? (
            <Typography variant="body2" color="text.secondary">
              Read from the sheet: {detectedSummary.filled} of {detectedSummary.total} bubbles filled
              {detectedSummary.flagged.length > 0 ? ` (${detectedSummary.flagged.join(', ')})` : ''}. Answers:{' '}
              {answers.map((a) => choiceLetter(a)).join(' ')}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              The bubbles will be read from the scan using the layout of {test.title}
              {page.testId !== null && page.testId !== test.id ? ' (a different test than the QR code named)' : ''}.
            </Typography>
          )}
        </Box>
      ) : null}

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        {onCancel ? (
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        {page.bucket !== 'graded' && page.bucket !== 'discarded' ? (
          <Button color="error" onClick={discard} disabled={busy}>
            Discard page
          </Button>
        ) : null}
        <Button variant="contained" onClick={() => assign(false)} disabled={!canAssign}>
          {reassign ? 'Move result' : 'Assign and grade'}
        </Button>
      </Stack>

      {conflict ? (
        <ConflictDialog
          open
          studentName={selectedOption ? `${selectedOption.student.lastName}, ${selectedOption.student.firstName}` : 'This student'}
          testTitle={test?.title ?? 'this test'}
          existing={conflict.existing}
          existingPage={conflict.existingPage}
          page={page}
          thisScore={null}
          busy={busy}
          onCancel={() => setConflict(null)}
          onKeep={() => {
            setConflict(null)
            discard()
          }}
          onReplace={() => assign(true)}
        />
      ) : null}
    </Stack>
  )
}

function CropCard({ label, src, flex }: { label: string; src: string; flex: number }): JSX.Element {
  return (
    <Box sx={{ flex, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ bgcolor: '#fff', borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider', lineHeight: 0 }}>
        <img src={src} alt={`${label} as written on the sheet`} style={{ width: '100%', display: 'block' }} />
      </Box>
    </Box>
  )
}

function ScoreCard({ title, thumb, version, score }: { title: string; thumb: string | null; version: string | null; score: string }): JSX.Element {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Box sx={{ height: 160, bgcolor: '#fff', borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider', display: 'flex', justifyContent: 'center' }}>
        {thumb ? <img src={scanImageUrl(thumb, version)} alt={title} style={{ height: '100%', width: 'auto' }} /> : null}
      </Box>
      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
        {score}
      </Typography>
    </Box>
  )
}
