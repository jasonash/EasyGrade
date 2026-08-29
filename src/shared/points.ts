/**
 * Gradebook points. A test may be "worth" a number of points that differs
 * from its question count (18 questions worth 50). The points a student
 * earns are derived from the stored correct/possible counts at display
 * time, so changing the worth never needs a regrade.
 */

/** Points earned, rounded to one decimal; null without a worth or with nothing possible. */
export function pointsEarned(correct: number, possible: number, totalPoints: number | null): number | null {
  if (totalPoints === null || possible <= 0) return null
  return Math.round((totalPoints * correct * 10) / possible) / 10
}

/** "36.1" or "36": at most one decimal, no trailing zero. */
export function formatPoints(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** "36.1 / 50 pts", or null when the test has no worth. */
export function pointsLabel(correct: number, possible: number, totalPoints: number | null): string | null {
  const earned = pointsEarned(correct, possible, totalPoints)
  if (earned === null || totalPoints === null) return null
  return `${formatPoints(earned)} / ${formatPoints(totalPoints)} pts`
}
