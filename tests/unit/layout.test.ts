import { describe, expect, it } from 'vitest'
import PDFDocument from 'pdfkit'
import {
  GRID_HEIGHT,
  GRID_TOP,
  MAX_INSTRUCTIONS_CHARS,
  MAX_STEM_CHARS,
  MAX_TITLE_CHARS,
  STEM_WIDTH,
  baseFontSize,
  buildSheetLayout,
  cellTextWidth,
  lineHeight,
  measureQuestion,
  measureTest,
  slotHeightFor,
  textWidth,
  unsupportedChars,
  wrapText
} from '../../src/shared/layout'

describe('constants', () => {
  it('derives slot heights and font sizes from the question count', () => {
    for (let n = 1; n <= 10; n++) {
      expect(slotHeightFor(n)).toBe(Math.floor(GRID_HEIGHT / n))
      expect(baseFontSize(n)).toBe(n <= 7 ? 11 : 10)
    }
    expect(slotHeightFor(10)).toBe(54)
    expect(slotHeightFor(1)).toBe(545)
  })
})

describe('buildSheetLayout', () => {
  it('places slots and bubbles from the question count alone', () => {
    const layout = buildSheetLayout([4, 4, 5, 4, 2, 4, 4, 4])
    expect(layout.questionCount).toBe(8)
    expect(layout.fontSize).toBe(10)
    expect(layout.slotHeight).toBe(68)
    expect(layout.slotTop).toEqual([200, 268, 336, 404, 472, 540, 608, 676])
    expect(layout.rowY).toEqual([214, 282, 350, 418, 486, 554, 622, 690])
    expect(layout.bubbleX).toEqual([455, 479, 503, 527, 551])
    expect(layout.nameBox).toEqual([50, 118, 380, 150])
    expect(layout.constantsVersion).toBe(1)
    expect(layout.slotTop[0]).toBe(GRID_TOP)
  })

  it('rejects counts outside the hard caps', () => {
    expect(() => buildSheetLayout([])).toThrow(RangeError)
    expect(() => buildSheetLayout(new Array(11).fill(4))).toThrow(RangeError)
    expect(() => buildSheetLayout([1])).toThrow(RangeError)
    expect(() => buildSheetLayout([6])).toThrow(RangeError)
  })
})

describe('wrapText', () => {
  it('returns no lines for blank text', () => {
    expect(wrapText('', 100, 11)).toEqual([])
    expect(wrapText('   ', 100, 11)).toEqual([])
  })

  it('keeps short text on one line and collapses whitespace', () => {
    expect(wrapText('  What   is  water? ', 300, 11)).toEqual(['What is water?'])
  })

  it('wraps at spaces so no line exceeds the width', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the riverbank at dawn'
    const lines = wrapText(text, 120, 11)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line, 11)).toBeLessThanOrEqual(120)
    expect(lines.join(' ')).toBe(text)
  })

  it('breaks a word wider than the box by character', () => {
    const word = 'W'.repeat(40)
    const lines = wrapText(word, 100, 11)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line, 11)).toBeLessThanOrEqual(100)
    expect(lines.join('')).toBe(word)
  })

  it('measures bold text wider than regular', () => {
    expect(textWidth('reference', 11, 'bold')).toBeGreaterThan(textWidth('reference', 11))
  })
})

describe('unsupportedChars', () => {
  it('accepts WinAnsi text and flags everything else once', () => {
    expect(unsupportedChars('Café “quotes” – dash … €')).toEqual([])
    expect(unsupportedChars('∑ x ∑ → y')).toEqual(['∑', '→'])
  })
})

describe('measureQuestion', () => {
  const short = { stem: 'What is the charge of an electron?', choices: ['Positive', 'Negative', 'Neutral', 'Varies'] }

  it('fits a short question even with ten on the page', () => {
    const m = measureQuestion(short, 0, 10)
    expect(m.fits).toBe(true)
    expect(m.columns).toBe(4)
    expect(m.choiceRows).toBe(1)
    expect(m.stemLines).toHaveLength(1)
    expect(m.requiredHeight).toBeLessThanOrEqual(m.slotHeight)
    expect(m.usage).toBeLessThan(1)
  })

  it('flags a maximum-length stem with ten questions as overflow', () => {
    const stem = 'word '.repeat(48).trim().slice(0, MAX_STEM_CHARS)
    const m = measureQuestion({ ...short, stem }, 0, 10)
    expect(m.fits).toBe(false)
    expect(m.problems[0]).toMatch(/^Too long by \d+ lines?$/)
    expect(m.usage).toBeGreaterThan(1)
  })

  it('fits that same stem when there are only four questions', () => {
    const stem = 'word '.repeat(48).trim().slice(0, MAX_STEM_CHARS)
    expect(measureQuestion({ ...short, stem }, 0, 4).fits).toBe(true)
  })

  it('picks 4, 2, or 1 columns from the widest choice', () => {
    const medium = 'A medium length choice'
    const long = 'x'.repeat(80)
    expect(measureQuestion({ stem: 'q', choices: ['a', 'b', 'c', 'd'] }, 0, 5).columns).toBe(4)
    expect(measureQuestion({ stem: 'q', choices: [medium, 'b', 'c', 'd'] }, 0, 5).columns).toBe(2)
    expect(measureQuestion({ stem: 'q', choices: [long, 'b'] }, 0, 5).columns).toBe(1)
    expect(measureQuestion({ stem: 'q', choices: ['a', 'b', 'c'] }, 0, 5).columns).toBe(3)
    expect(measureQuestion({ stem: 'q', choices: ['a', 'b'] }, 0, 5).columns).toBe(2)
  })

  it('lays five short choices out as two rows of four columns', () => {
    const m = measureQuestion({ stem: 'q', choices: ['a', 'b', 'c', 'd', 'e'] }, 0, 5)
    expect(m.columns).toBe(4)
    expect(m.choiceRows).toBe(2)
    expect(m.choiceCells.map((c) => [c.column, c.row])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]])
  })

  it('counts wrapped lines in single-column mode', () => {
    const long = 'choice text that is long enough to need wrapping when squeezed into a narrow column '.repeat(1)
    const m = measureQuestion({ stem: 'q', choices: [long + long, 'b'] }, 0, 3)
    expect(m.columns).toBe(1)
    expect(m.choiceRows).toBeGreaterThan(2)
  })

  it('reports unsupported characters', () => {
    const m = measureQuestion({ stem: 'Solve ∑', choices: ['a', 'b'] }, 0, 5)
    expect(m.fits).toBe(false)
    expect(m.problems).toEqual(['Unsupported characters: ∑'])
  })
})

describe('measureTest', () => {
  const q = { stem: 'What is the charge of an electron?', choices: ['Positive', 'Negative', 'Neutral', 'Varies'] }

  it('fits a normal test and reports the worst question usage', () => {
    const m = measureTest({ title: 'Unit 3 Quiz', instructions: 'Fill bubbles completely.', questions: [q, q, q] })
    expect(m.fits).toBe(true)
    expect(m.problems).toEqual([])
    expect(m.usage).toBe(Math.max(...m.questions.map((x) => x.usage)))
    expect(m.titleLines).toEqual(['Unit 3 Quiz'])
    expect(m.instructionLines).toEqual(['Fill bubbles completely.'])
  })

  it('always fits a maximum-length title in two lines', () => {
    const m = measureTest({ title: 'W'.repeat(MAX_TITLE_CHARS), instructions: '', questions: [q] })
    expect(m.titleLines.length).toBeLessThanOrEqual(2)
    expect(m.problems).toEqual([])
  })

  it('flags instructions that need more than two lines', () => {
    const m = measureTest({ title: 'T', instructions: 'W'.repeat(MAX_INSTRUCTIONS_CHARS), questions: [q] })
    expect(m.fits).toBe(false)
    expect(m.problems).toContain('Instructions are too long to fit above the grid')
  })

  it('requires at least one question and caps at ten', () => {
    expect(measureTest({ title: 'T', instructions: '', questions: [] }).problems).toContain('Add at least one question')
    const m = measureTest({ title: 'T', instructions: '', questions: new Array(11).fill(q) })
    expect(m.fits).toBe(false)
    expect(m.problems).toContain('At most 10 questions fit on one page')
  })

  it('fails when any question overflows', () => {
    const big = { ...q, stem: 'word '.repeat(48).trim() }
    const m = measureTest({ title: 'T', instructions: '', questions: [...new Array(9).fill(q), big] })
    expect(m.fits).toBe(false)
    expect(m.questions[9]?.fits).toBe(false)
    expect(m.usage).toBeGreaterThan(1)
  })
})

describe('agreement with pdfkit', () => {
  const doc = new PDFDocument({ autoFirstPage: false })
  const corpus = [
    'What is the charge of an electron?',
    'Café “quotes” – dash … € ñ Ø ß',
    'The quick brown fox jumps over the lazy dog near the riverbank at dawn while the owls watch silently',
    'Supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis',
    'W'.repeat(60),
    'a b c d e f g h i j k l m n o p q r s t u v w x y z',
    '1) H2O   2) CO2   3) NaCl',
    'x'.repeat(80)
  ]

  it('measures widths exactly like pdfkit Helvetica', () => {
    for (const size of [8.5, 10, 11, 14]) {
      doc.font('Helvetica').fontSize(size)
      for (const text of corpus) expect(textWidth(text, size)).toBeCloseTo(doc.widthOfString(text), 6)
      doc.font('Helvetica-Bold')
      for (const text of corpus) expect(textWidth(text, size, 'bold')).toBeCloseTo(doc.widthOfString(text), 6)
    }
  })

  it('uses the same line height as pdfkit', () => {
    for (const size of [8.5, 10, 11, 14]) {
      doc.font('Helvetica').fontSize(size)
      expect(lineHeight(size)).toBeCloseTo(doc.currentLineHeight(true), 6)
    }
  })

  it('produces lines that pdfkit measures as fitting the box', () => {
    for (const size of [10, 11]) {
      doc.font('Helvetica').fontSize(size)
      for (const width of [STEM_WIDTH, cellTextWidth(4), cellTextWidth(2), 60]) {
        for (const text of corpus) {
          for (const line of wrapText(text, width, size)) {
            expect(doc.widthOfString(line)).toBeLessThanOrEqual(width + 1e-6)
          }
        }
      }
    }
  })

  it('never predicts fewer lines than pdfkit heightOfString for space-wrapped text', () => {
    doc.font('Helvetica').fontSize(11)
    for (const text of corpus) {
      const ours = wrapText(text, STEM_WIDTH, 11).length * lineHeight(11)
      const theirs = doc.heightOfString(text, { width: STEM_WIDTH })
      expect(ours).toBeGreaterThanOrEqual(theirs - 1e-6)
    }
  })
})
