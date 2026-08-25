import { CHOICE_LETTERS, buildSheetLayout } from '../../src/shared/layout'
import type { DetectedRow, ScanContext, ScanPageResult } from '../../src/shared/schemas'
import type { RowOutcome } from '../fixtures/calibration'

/**
 * Shared between the real-scan regression test and the scan report script:
 * turn tests/fixtures/real-manifest.json into a ScanContext and judge a
 * page's rows against the manifest's accept lists.
 */

export interface ManifestRow {
  q: number
  choiceCount: number
  key: string
  accept: RowOutcome[]
  review: 'yes' | 'no' | 'either'
  note: string
}

export interface ManifestTest {
  code: string
  layoutVersion: number
  id: number
  title: string
  rows: ManifestRow[]
}

export interface ManifestSheet {
  id: string
  test: 'clean' | 'edge' | null
  student: 'alpha' | 'bravo' | 'charlie' | null
  bucket: 'graded' | 'needs-assignment' | 'unreadable' | 'not-a-sheet' | 'conflict'
  rows?: 'as-instructed' | 'all-blank'
  testCode: string | null
  studentCode: string | null
}

export interface ManifestFile {
  file: string
  device: string
  pages: string[]
  howToCapture: string
}

export interface Manifest {
  section: { id: number; name: string }
  students: Record<string, string>
  tests: Record<'clean' | 'edge', ManifestTest>
  sheets: ManifestSheet[]
  files: ManifestFile[]
}

export function contextFromManifest(manifest: Manifest): ScanContext {
  const ctx: ScanContext = { tests: {}, students: {} }
  for (const test of Object.values(manifest.tests)) {
    ctx.tests[test.code] = {
      id: test.id,
      sectionId: manifest.section.id,
      layoutVersion: test.layoutVersion,
      layout: buildSheetLayout(test.rows.map((r) => r.choiceCount))
    }
  }
  let id = 1
  for (const code of Object.values(manifest.students)) {
    ctx.students[code] = { id: id++, sectionId: manifest.section.id }
  }
  return ctx
}

export function rowOutcome(row: DetectedRow): RowOutcome | 'ambiguous' {
  if (row.state === 'filled') return CHOICE_LETTERS[row.choice ?? 0] ?? 'A'
  if (row.state === 'blank') return 'blank'
  if (row.state === 'multiple') return 'multiple'
  return 'ambiguous'
}

export interface RowVerdict {
  q: number
  outcome: RowOutcome | 'ambiguous'
  expected: RowOutcome[]
  review: ManifestRow['review']
  ok: boolean
  ideal: boolean
}

/**
 * A row passes when its outcome is in the accept list, or when it lands in
 * review (ambiguous) and review is permitted. Rows that must not be reviewed
 * have to come back filled with an accepted letter.
 */
export function judgeRows(answers: DetectedRow[], sheet: ManifestSheet, test: ManifestTest): RowVerdict[] {
  return test.rows.map((spec, i) => {
    const row = answers[i]
    const expected: RowOutcome[] = sheet.rows === 'all-blank' ? ['blank'] : spec.accept
    const review = sheet.rows === 'all-blank' ? 'yes' : spec.review
    if (!row) return { q: i, outcome: 'ambiguous', expected, review, ok: false, ideal: false }
    const outcome = rowOutcome(row)
    const flagged = row.state !== 'filled'
    let ok: boolean
    if (outcome === 'ambiguous') ok = review !== 'no'
    else if (review === 'no') ok = !flagged && expected.includes(outcome)
    else if (review === 'yes') ok = flagged && expected.includes(outcome)
    else ok = expected.includes(outcome)
    const ideal = outcome !== 'ambiguous' && outcome === expected[0]
    return { q: i, outcome, expected, review, ok, ideal }
  })
}

export function expectedBucket(sheet: ManifestSheet): ScanPageResult['bucket'] {
  switch (sheet.bucket) {
    case 'graded':
    case 'conflict':
      return 'graded'
    case 'needs-assignment':
      return 'needs_assignment'
    case 'unreadable':
      return 'unreadable'
    case 'not-a-sheet':
      return 'not_a_sheet'
  }
}
