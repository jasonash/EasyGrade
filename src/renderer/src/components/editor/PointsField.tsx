import type { JSX, KeyboardEvent } from 'react'
import { useEffect, useState } from 'react'
import { InputAdornment, TextField } from '@mui/material'
import type { Test } from '@shared/types'
import { MAX_TOTAL_POINTS, TotalPointsSchema } from '@shared/schemas'
import { formatPoints } from '@shared/points'
import { useTestsStore } from '@/stores/tests.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'

interface Props {
  test: Test
  onChanged: (test: Test) => void
}

/** "50" or "12.5" from the field; null when blank; undefined when not a usable number. */
function parsePoints(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return undefined
  const rounded = Math.round(value * 10) / 10
  return TotalPointsSchema.safeParse(rounded).success ? rounded : undefined
}

/**
 * What the test is worth in the gradebook (18 questions worth 50 points).
 * Saves on blur or Enter, at any status: the worth is not printed, and the
 * points a student earns are worked out from it whenever a score is shown.
 */
export function PointsField({ test, onChanged }: Props): JSX.Element {
  const updateTotalPoints = useTestsStore((s) => s.updateTotalPoints)
  const toast = useUiStore((s) => s.toast)
  const [text, setText] = useState(test.totalPoints === null ? '' : formatPoints(test.totalPoints))
  const [busy, setBusy] = useState(false)

  // Follow outside changes (a reload, a copy) without clobbering what is being typed.
  useEffect(() => {
    setText(test.totalPoints === null ? '' : formatPoints(test.totalPoints))
  }, [test.id, test.totalPoints])

  const invalid = parsePoints(text) === undefined

  // Reads the field itself rather than state so a blur right after a keystroke sees the final text.
  const commit = async (raw: string): Promise<void> => {
    const parsed = parsePoints(raw)
    if (parsed === undefined) return
    if (parsed === test.totalPoints) {
      setText(parsed === null ? '' : formatPoints(parsed))
      return
    }
    setBusy(true)
    try {
      const updated = await updateTotalPoints({ id: test.id, totalPoints: parsed })
      onChanged(updated)
      setText(updated.totalPoints === null ? '' : formatPoints(updated.totalPoints))
    } catch (err) {
      toast('error', describeError(err))
      setText(test.totalPoints === null ? '' : formatPoints(test.totalPoints))
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <TextField
      label="Worth"
      value={text}
      onChange={(e) => setText(e.target.value.slice(0, 8))}
      onBlur={(e) => void commit(e.target.value)}
      onKeyDown={onKeyDown}
      size="small"
      disabled={busy}
      error={invalid}
      placeholder="e.g. 50"
      helperText={invalid ? `Enter a number from 0.5 to ${MAX_TOTAL_POINTS}` : 'Optional. Gradebook points for the whole test; scores then show points too.'}
      slotProps={{
        input: { endAdornment: <InputAdornment position="end">pts</InputAdornment> },
        htmlInput: { inputMode: 'decimal', 'aria-label': 'Points the test is worth' }
      }}
      sx={{ width: 200, flexShrink: 0 }}
    />
  )
}
