import { describe, expect, it } from 'vitest'
import { firstFinalizeProblem } from '../../src/shared/test-validation'

const good = { stem: 'What is 2 + 2?', choices: ['3', '4', '5', '6'], correctChoice: 1 }

describe('firstFinalizeProblem', () => {
  it('accepts a complete test', () => {
    expect(firstFinalizeProblem({ title: 'Quiz', instructions: '', questions: [good] })).toBeNull()
  })

  it('names the blank title first', () => {
    expect(firstFinalizeProblem({ title: '  ', instructions: '', questions: [good] })).toBe('Title: Title is required')
  })

  it('names the question with no text', () => {
    expect(firstFinalizeProblem({ title: 'Quiz', instructions: '', questions: [good, { ...good, stem: '' }] })).toBe(
      'Question 2: Question text is required'
    )
  })

  it('names a blank choice by its letter', () => {
    expect(firstFinalizeProblem({ title: 'Quiz', instructions: '', questions: [{ ...good, choices: ['3', '4', '', '6'] }] })).toBe(
      'Question 1, choice C: Choice text is required'
    )
  })

  it('reports a correct answer outside the choices', () => {
    expect(firstFinalizeProblem({ title: 'Quiz', instructions: '', questions: [{ ...good, correctChoice: 7 }] })).toBe(
      'Question 1: The correct answer must be one of the choices'
    )
  })
})
