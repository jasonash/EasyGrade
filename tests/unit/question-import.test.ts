import { describe, expect, it } from 'vitest'
import { buildQuestionPrompt, parseQuestions } from '../../src/shared/question-import'

const CANONICAL = `1. Which particle carries a negative charge?
A) Proton
B) Electron *
C) Neutron
D) Photon

2. What is the SI unit of force?
A) Joule
B) Watt
C) Newton *
D) Pascal
`

describe('parseQuestions', () => {
  it('parses the format the prompt asks for', () => {
    const { questions, error } = parseQuestions(CANONICAL)
    expect(error).toBeNull()
    expect(questions).toHaveLength(2)
    expect(questions[0]).toEqual({
      stem: 'Which particle carries a negative charge?',
      choices: ['Proton', 'Electron', 'Neutron', 'Photon'],
      correctChoice: 1,
      issues: []
    })
    expect(questions[1]?.correctChoice).toBe(2)
    expect(questions[1]?.issues).toEqual([])
  })

  it('ignores chat chatter, code fences, bold, and Windows line endings', () => {
    const text =
      'Sure! Here are 2 questions based on your notes:\r\n\r\n```\r\n**1. Which particle carries a negative charge?**\r\nA) Proton\r\nB) Electron *\r\nC) Neutron\r\n\r\n2) What is the SI unit of force?\r\n(A) Joule\r\n(B) Watt\r\n(C) Newton*\r\n```\r\n\r\nLet me know if you want more!\r\n'
    const { questions } = parseQuestions(text)
    expect(questions.map((q) => q.stem)).toEqual(['Which particle carries a negative charge?', 'What is the SI unit of force?'])
    expect(questions.map((q) => q.correctChoice)).toEqual([1, 2])
    expect(questions[1]?.choices).toEqual(['Joule', 'Watt', 'Newton'])
  })

  it('accepts "Answer: X" lines, a trailing answer key, bold-only marking, and check marks', () => {
    const text = `1. Q one
A. one
B. two
Answer: B

2. Q two
a) uno
b) dos
c) tres

Question 3: Q three
A) x
**B) y**
C) z

4. Q four
A) p ✓
B) q

Answer key
1. B
2: C, 3 - B`
    const { questions } = parseQuestions(text)
    expect(questions).toHaveLength(4)
    expect(questions.map((q) => q.correctChoice)).toEqual([1, 2, 1, 0])
    expect(questions.map((q) => q.issues)).toEqual([[], [], [], []])
    expect(questions[2]?.choices).toEqual(['x', 'y', 'z'])
  })

  it('flags questions that need attention instead of dropping them', () => {
    const text = `1. No answer marked
A) one
B) two

2. Two marked
A) one *
B) two *

3. Six choices
A) a
B) b
C) c
D) d
E) e
F) f *

4. ${'x'.repeat(250)}
A) ${'y'.repeat(90)} *
B) short

5. Only one
A) alone *

6. Symbols H₂O
A) yes *
B) no`
    const { questions } = parseQuestions(text)
    expect(questions).toHaveLength(6)
    expect(questions[0]?.correctChoice).toBeNull()
    expect(questions[0]?.issues).toEqual(['No correct answer marked; pick one'])
    expect(questions[1]?.correctChoice).toBe(0)
    expect(questions[1]?.issues[0]).toMatch(/More than one/)
    expect(questions[2]?.choices).toHaveLength(5)
    expect(questions[2]?.correctChoice).toBeNull()
    expect(questions[2]?.issues.join(' ')).toMatch(/only the first 5/)
    expect(questions[3]?.stem).toHaveLength(240)
    expect(questions[3]?.choices[0]).toHaveLength(80)
    expect(questions[3]?.issues.join(' ')).toMatch(/cut to 240/)
    expect(questions[4]?.issues.join(' ')).toMatch(/at least 2/)
    expect(questions[5]?.issues.join(' ')).toMatch(/Unsupported characters/)
  })

  it('handles unnumbered and multi-line stems', () => {
    const text = `Which gas do plants absorb
during photosynthesis?
A) Oxygen
B) Carbon dioxide *
Which planet is largest?
A) Earth
B) Jupiter *`
    const { questions } = parseQuestions(text)
    expect(questions.map((q) => q.stem)).toEqual(['Which gas do plants absorb during photosynthesis?', 'Which planet is largest?'])
    expect(questions.map((q) => q.correctChoice)).toEqual([1, 1])
  })

  it('parses JSON replies in a few common shapes', () => {
    const text = `Here you go:
\`\`\`json
[
  { "question": "One?", "choices": ["a", "b", "c"], "answer": "B" },
  { "stem": "Two?", "options": [{ "text": "x" }, { "text": "y" }], "correctIndex": 0 },
  { "text": "Three?", "choices": { "A": "p", "B": "q" }, "correct_answer": "q" },
  { "question": "Four?", "choices": ["m", "n"], "answer": 2 }
]
\`\`\``
    const { questions } = parseQuestions(text)
    expect(questions.map((q) => q.stem)).toEqual(['One?', 'Two?', 'Three?', 'Four?'])
    expect(questions.map((q) => q.correctChoice)).toEqual([1, 0, 1, 1])
    expect(parseQuestions('{ "questions": [ { "question": "Q", "choices": ["a", "b"], "answer": "a" } ] }').questions[0]?.correctChoice).toBe(0)
  })

  it('reports nothing found for empty or unusable text', () => {
    expect(parseQuestions('   ')).toEqual({ questions: [], error: null })
    const { questions, error } = parseQuestions('Just a paragraph of notes with no choices at all.')
    expect(questions).toEqual([])
    expect(error).toMatch(/No questions found/)
  })
})

describe('buildQuestionPrompt', () => {
  it('spells out the count, choices, format, and limits', () => {
    const prompt = buildQuestionPrompt({ count: 5, choices: 4, gradeLevel: '10th grade', topic: 'Unit 3: Atomic structure' })
    expect(prompt).toContain('Write 5 multiple-choice quiz questions for 10th grade students')
    expect(prompt).toContain('Focus: Unit 3: Atomic structure')
    expect(prompt).toContain('exactly 4 choices labeled A, B, C, D')
    expect(prompt).toContain('B) Electron *')
    expect(prompt).not.toContain('E)')
    expect(prompt).toContain('fit on one printed page')
    expect(prompt.trim().endsWith('Here is the material:')).toBe(true)
    // The prompt's own example must parse.
    const example = prompt.split('\n\n')[2] ?? ''
    expect(parseQuestions(example).questions[0]?.correctChoice).toBe(1)
  })

  it('clamps out-of-range values and omits empty options', () => {
    const prompt = buildQuestionPrompt({ count: 40, choices: 9, gradeLevel: '  ', topic: '' })
    expect(prompt).toContain('Write 10 multiple-choice quiz questions, based only')
    expect(prompt).toContain('exactly 5 choices labeled A, B, C, D, E')
    expect(prompt).not.toContain('Focus:')
  })
})
