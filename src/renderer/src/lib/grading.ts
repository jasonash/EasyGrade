import type { LabelStyle, PageBucket, QuestionFlag, ScanPageDetail } from '@shared/types'
import { choiceLabel } from '@shared/layout'
import { parseQrPayload } from '@shared/codes'

/** Label for a zero-based choice (A..H, or T/F on a true/false row); a dash for blank. */
export function choiceLetter(choice: number | null | undefined, labelStyle: LabelStyle = 'letters'): string {
  if (choice === null || choice === undefined) return '–'
  return choiceLabel(choice, labelStyle)
}

export function percentOf(correct: number, possible: number): number | null {
  return possible > 0 ? (100 * correct) / possible : null
}

export function formatPercent(value: number | null): string {
  return value === null ? '' : `${Math.round(value)}%`
}

const FLAG_LABELS: Record<QuestionFlag['kind'], string> = {
  blank: 'blank',
  multiple: 'multiple marks',
  ambiguous: 'ambiguous',
  low_confidence: 'faint'
}

export function flagLabel(flag: QuestionFlag): string {
  return `Q${flag.q + 1} ${FLAG_LABELS[flag.kind]}`
}

export function flagKindLabel(kind: QuestionFlag['kind']): string {
  return FLAG_LABELS[kind]
}

export interface BucketMeta {
  key: PageBucket
  label: string
  /** Label used in the batch summary chips ("3 need assignment"). */
  countLabel: string
  color: 'success' | 'warning' | 'error' | 'default'
}

export const BUCKETS: BucketMeta[] = [
  { key: 'graded', label: 'Graded', countLabel: 'graded', color: 'success' },
  { key: 'needs_assignment', label: 'Needs assignment', countLabel: 'need assignment', color: 'warning' },
  { key: 'unreadable', label: 'Unreadable', countLabel: 'unreadable', color: 'error' },
  { key: 'not_a_sheet', label: 'Not a sheet', countLabel: 'not a sheet', color: 'default' },
  { key: 'discarded', label: 'Discarded', countLabel: 'discarded', color: 'default' }
]

/** True when the stored page image is the aligned canonical page, so bubbles can be read with any layout. */
export function canReadBubbles(page: ScanPageDetail): boolean {
  return page.alignmentQuality === 'good' || page.alignmentQuality === 'weak'
}

/** Why a page is not simply graded, in the teacher's words. */
export function describePage(page: ScanPageDetail): string | null {
  const who = page.studentName ?? 'a student'
  switch (page.reason) {
    case 'qr':
      return 'The QR code could not be read. Choose the test and student to grade this page.'
    case 'alignment':
      return page.qrPayload
        ? 'The QR code was read but the page could not be aligned, so the bubbles were not read. Enter the answers by hand.'
        : 'No registration marks were found. If this is an answer sheet, enter the answers by hand.'
    case 'orientation':
      return 'The page orientation could not be determined.'
    case 'roster_mismatch':
      return `The QR code names ${who}, who is not on the roster for ${page.testTitle ?? 'this test'}. Confirm who this sheet belongs to.`
    case 'blank_sheet':
      return 'Blank sheet: the student wrote their name instead of using a personalized sheet.'
    case 'conflict':
      return `${who} already has a result for ${page.testTitle ?? 'this test'}.`
    case 'unknown_test': {
      const code = page.qrPayload ? parseQrPayload(page.qrPayload)?.testCode : null
      return `The QR code names a test that no longer exists${code ? ` (code ${code})` : ''}.`
    }
    case 'layout': {
      const version = page.qrPayload ? parseQrPayload(page.qrPayload)?.layoutVersion : null
      return `This sheet was printed from an older version of the test${version ? ` (layout v${version})` : ''}. The bubbles can be read with the current layout, but check the answers if the questions changed.`
    }
    default:
      if (page.bucket === 'not_a_sheet') return 'No answer sheet was detected on this page.'
      if (page.bucket === 'discarded') return 'This page was discarded. Assign it to grade it after all.'
      return null
  }
}
