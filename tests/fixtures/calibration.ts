/**
 * Calibration fixtures for the scan pipeline.
 *
 * Two self-describing tests: every stem tells the person filling the sheet
 * exactly what to mark, so each scanned page carries its own ground truth.
 * This file is the single source for the seed script (scripts/seed-fixtures.ts),
 * the generated manifest (tests/fixtures/real-manifest.json), and the Phase 5
 * regression test that runs the real scans through the pipeline.
 */

export type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'
export type RowOutcome = Letter | 'blank' | 'multiple'

export interface RowExpectation {
  /** Outcomes the grader may report for this row. Anything else is a failure. */
  accept: RowOutcome[]
  /** Whether the row must be flagged for review: yes, no, or either is acceptable. */
  review: 'yes' | 'no' | 'either'
  note: string
}

export interface FixtureQuestion {
  stem: string
  choiceCount: number
  /** Zero-based answer key stored on the test. */
  key: number
  expect: RowExpectation
}

export interface FixtureTest {
  slug: 'clean' | 'edge'
  title: string
  instructions: string
  questions: FixtureQuestion[]
}

const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E']

/** Choice texts for a fixture question: "Option A" .. "Option E". */
export function fixtureChoices(count: number): string[] {
  return LETTERS.slice(0, count).map((l) => `Option ${l}`)
}

function clean(letter: Letter, choiceCount: number): FixtureQuestion {
  const key = LETTERS.indexOf(letter)
  return {
    stem: `Fill bubble ${letter} darkly.`,
    choiceCount,
    key,
    expect: { accept: [letter], review: 'no', note: `Clean single mark on ${letter}` }
  }
}

export const CLEAN_TEST: FixtureTest = {
  slug: 'clean',
  title: 'Fixture A: Clean marks',
  instructions: 'Calibration sheet. Follow each question exactly. Use the writing tool named on the checklist.',
  questions: [
    clean('B', 4),
    clean('A', 2),
    clean('E', 5),
    clean('C', 3),
    clean('D', 4),
    clean('B', 2),
    clean('A', 5),
    clean('C', 4),
    clean('B', 3),
    clean('D', 5)
  ]
}

export const EDGE_TEST: FixtureTest = {
  slug: 'edge',
  title: 'Fixture B: Edge cases',
  instructions: 'Calibration sheet. Follow each question exactly, even when it asks for a mistake.',
  questions: [
    {
      stem: 'Control: fill bubble B darkly with pencil.',
      choiceCount: 4,
      key: 1,
      expect: { accept: ['B'], review: 'no', note: 'Control row' }
    },
    {
      stem: 'Leave this question blank. Do not fill any bubble.',
      choiceCount: 4,
      key: 0,
      expect: { accept: ['blank'], review: 'yes', note: 'Blank row scores 0 and goes to review' }
    },
    {
      stem: 'Fill both A and C darkly.',
      choiceCount: 4,
      key: 0,
      expect: { accept: ['multiple'], review: 'yes', note: 'Two dark marks score 0 and go to review' }
    },
    {
      stem: 'Fill D darkly, then give B a single light pencil stroke.',
      choiceCount: 4,
      key: 3,
      expect: { accept: ['D', 'multiple'], review: 'either', note: 'Dark vs faint: D is ideal, review is acceptable, B is a failure' }
    },
    {
      stem: 'Fill E darkly, erase it completely, then fill A darkly.',
      choiceCount: 5,
      key: 0,
      expect: { accept: ['A'], review: 'either', note: 'Erasure residue on E must not win' }
    },
    {
      stem: 'Draw a check mark inside bubble C instead of filling it.',
      choiceCount: 4,
      key: 2,
      expect: { accept: ['C', 'blank'], review: 'either', note: 'Partial mark: C or review; any other letter is a failure' }
    },
    {
      stem: 'Fill B darkly, then draw a stray pen line across the bubble row.',
      choiceCount: 4,
      key: 1,
      expect: { accept: ['B', 'multiple'], review: 'either', note: 'Stray line through the strip; B is ideal' }
    },
    {
      stem: 'Fill C darkly using a pen instead of pencil.',
      choiceCount: 4,
      key: 2,
      expect: { accept: ['C'], review: 'no', note: 'Pen ink is darker and glossier than pencil' }
    },
    {
      stem: 'Fill bubble A only about half full (half the circle).',
      choiceCount: 4,
      key: 0,
      expect: { accept: ['A', 'blank'], review: 'either', note: 'Threshold calibration for partial fills' }
    },
    {
      stem: 'Circle the letter A in this text. Do not fill any bubble.',
      choiceCount: 4,
      key: 0,
      expect: { accept: ['blank'], review: 'yes', note: 'Marks in the text column must be ignored' }
    }
  ]
}

export const FIXTURE_TESTS: FixtureTest[] = [CLEAN_TEST, EDGE_TEST]

export const FIXTURE_SECTION = { name: 'Fixtures', schoolYear: '2026-27' }

export interface FixtureStudent {
  slug: 'alpha' | 'bravo' | 'charlie'
  lastName: string
  firstName: string
  studentNumber: string
}

export const FIXTURE_STUDENTS: FixtureStudent[] = [
  { slug: 'alpha', lastName: 'Alpha', firstName: 'Test', studentNumber: '900001' },
  { slug: 'bravo', lastName: 'Bravo', firstName: 'Test', studentNumber: '900002' },
  { slug: 'charlie', lastName: 'Charlie', firstName: 'Test', studentNumber: '900003' }
]

/** Expected bucket for a whole page (ARCHITECTURE 6.4). */
export type PageBucket = 'graded' | 'needs-assignment' | 'unreadable' | 'not-a-sheet' | 'conflict'

export interface PhysicalSheet {
  id: string
  test: FixtureTest['slug'] | null
  student: FixtureStudent['slug'] | null
  howToFill: string
  bucket: PageBucket
  /** Per-row override when the page is not simply "as instructed". */
  rows?: 'as-instructed' | 'all-blank'
}

export const SHEETS: PhysicalSheet[] = [
  {
    id: 'S1',
    test: 'clean',
    student: 'alpha',
    howToFill: 'Fixture A for Test Alpha. Fill every row exactly as instructed, in pencil.',
    bucket: 'graded',
    rows: 'as-instructed'
  },
  {
    id: 'S2',
    test: 'clean',
    student: 'bravo',
    howToFill: 'Fixture A for Test Bravo. Fill every row exactly as instructed, in blue or black pen.',
    bucket: 'graded',
    rows: 'as-instructed'
  },
  {
    id: 'S3',
    test: 'clean',
    student: null,
    howToFill:
      'Fixture A blank sheet. Handwrite "Test Delta" in the Name box and "Fixtures" in the Section box, then fill every row as instructed, in pencil.',
    bucket: 'needs-assignment',
    rows: 'as-instructed'
  },
  {
    id: 'S4',
    test: 'edge',
    student: 'alpha',
    howToFill: 'Fixture B for Test Alpha. Follow every row exactly, in pencil unless the row says pen.',
    bucket: 'graded',
    rows: 'as-instructed'
  },
  {
    id: 'S5',
    test: 'edge',
    student: 'charlie',
    howToFill: 'Fixture B for Test Charlie. Leave the whole sheet untouched: no marks at all.',
    bucket: 'graded',
    rows: 'all-blank'
  },
  {
    id: 'S6',
    test: 'clean',
    student: 'alpha',
    howToFill: 'A photocopy of S1 made on the Canon after S1 is filled in. Same QR as S1, so it must surface as a duplicate.',
    bucket: 'conflict',
    rows: 'as-instructed'
  },
  {
    id: 'D',
    test: null,
    student: null,
    howToFill: 'Any ordinary printed page that is not an answer sheet (a letter, a worksheet, a recipe).',
    bucket: 'not-a-sheet'
  }
]

export type Device = 'scansnap' | 'canon-flatbed' | 'iphone-notes' | 'iphone-adobescan' | 'iphone-camera'

export interface FixtureFile {
  file: string
  device: Device
  /** Physical sheets in page order. */
  pages: string[]
  howToCapture: string
}

export const FILES: FixtureFile[] = [
  {
    file: 'scansnap_batch_normal.pdf',
    device: 'scansnap',
    pages: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'D'],
    howToCapture: 'All seven pages in one feeder run, in this order, all face up and right way round, default settings.'
  },
  {
    file: 'scansnap_batch_upsidedown.pdf',
    device: 'scansnap',
    pages: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'D'],
    howToCapture: 'Same stack and order, but rotate S1 and S4 180 degrees (upside down) before feeding.'
  },
  {
    file: 'scansnap_single_s4.pdf',
    device: 'scansnap',
    pages: ['S4'],
    howToCapture: 'S4 alone, default settings, so there is a single-page file.'
  },
  {
    file: 'canon-flatbed_all_straight.pdf',
    device: 'canon-flatbed',
    pages: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'D'],
    howToCapture: 'All seven pages one at a time on the flatbed, squared up, saved as one PDF in order.'
  },
  {
    file: 'canon-flatbed_s1_straight.pdf',
    device: 'canon-flatbed',
    pages: ['S1'],
    howToCapture: 'S1 on the flatbed, squared up against the guides, default settings. PDF, JPG, or PNG is fine.'
  },
  {
    file: 'canon-flatbed_s4_askew.pdf',
    device: 'canon-flatbed',
    pages: ['S4'],
    howToCapture: 'S4 on the flatbed placed visibly crooked, about 5 degrees off.'
  },
  {
    file: 'canon-flatbed_s2_pen.pdf',
    device: 'canon-flatbed',
    pages: ['S2'],
    howToCapture: 'S2 (pen) on the flatbed, straight.'
  },
  {
    file: 'canon-flatbed_s6_photocopy.pdf',
    device: 'canon-flatbed',
    pages: ['S6'],
    howToCapture: 'The photocopy S6 on the flatbed, straight.'
  },
  {
    file: 'canon-flatbed_s5_untouched.pdf',
    device: 'canon-flatbed',
    pages: ['S5'],
    howToCapture: 'S5 (untouched) on the flatbed, straight.'
  },
  {
    file: 'iphone-notes_s1.pdf',
    device: 'iphone-notes',
    pages: ['S1'],
    howToCapture: 'Notes app > Scan Documents, S1 on a table, let it auto-capture and auto-crop, save as PDF.'
  },
  {
    file: 'iphone-notes_s4.pdf',
    device: 'iphone-notes',
    pages: ['S4'],
    howToCapture: 'Notes app scan of S4, same as above.'
  },
  {
    file: 'iphone-notes_batch.pdf',
    device: 'iphone-notes',
    pages: ['S1', 'S2', 'S4'],
    howToCapture: 'One Notes scan session capturing S1, S2, S4 as three pages in one PDF.'
  },
  {
    file: 'iphone-adobescan_s4.pdf',
    device: 'iphone-adobescan',
    pages: ['S4'],
    howToCapture: 'Adobe Scan of S4 with its default document enhancement on.'
  },
  {
    file: 'iphone-adobescan_s1.pdf',
    device: 'iphone-adobescan',
    pages: ['S1'],
    howToCapture: 'Adobe Scan of S1.'
  },
  {
    file: 'iphone-camera_s1_flat.jpg',
    device: 'iphone-camera',
    pages: ['S1'],
    howToCapture: 'Plain Camera app, phone held flat directly above S1 in good light, whole page in frame with some table around it. Export as JPG (not HEIC).'
  },
  {
    file: 'iphone-camera_s4_angle.jpg',
    device: 'iphone-camera',
    pages: ['S4'],
    howToCapture: 'Plain Camera app, S4 photographed from an angle (about 30 degrees off vertical) with your own shadow falling across part of it. JPG.'
  },
  {
    file: 'iphone-camera_s4_lowlight.jpg',
    device: 'iphone-camera',
    pages: ['S4'],
    howToCapture: 'Plain Camera app, S4 in dim room light, no flash. JPG.'
  },
  {
    file: 'iphone-camera_s3_blankname.jpg',
    device: 'iphone-camera',
    pages: ['S3'],
    howToCapture: 'Plain Camera app, S3 (handwritten name) flat in good light. JPG.'
  }
]
