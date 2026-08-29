import { describe, expect, it } from 'vitest'
import { formatPoints, pointsEarned, pointsLabel } from '../../src/shared/points'

describe('gradebook points', () => {
  it('scales correct/possible to the worth and rounds to one decimal', () => {
    expect(pointsEarned(13, 18, 50)).toBe(36.1)
    expect(pointsEarned(18, 18, 50)).toBe(50)
    expect(pointsEarned(0, 18, 50)).toBe(0)
    expect(pointsEarned(1, 3, 10)).toBe(3.3)
    expect(pointsEarned(2, 3, 10)).toBe(6.7)
  })

  it('is null without a worth or with nothing possible', () => {
    expect(pointsEarned(5, 10, null)).toBeNull()
    expect(pointsEarned(0, 0, 50)).toBeNull()
    expect(pointsLabel(5, 10, null)).toBeNull()
  })

  it('formats without trailing zeros', () => {
    expect(formatPoints(50)).toBe('50')
    expect(formatPoints(36.1)).toBe('36.1')
    expect(formatPoints(12.5)).toBe('12.5')
    expect(pointsLabel(13, 18, 50)).toBe('36.1 / 50 pts')
  })
})
