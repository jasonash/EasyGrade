import { CHOICE_LETTERS, TRUE_FALSE_LETTERS } from './constants'
import type { LabelStyle } from '../schemas/test'

/** What is printed inside bubble `c` of a row: A..H, or T/F for true/false rows. */
export function choiceLabel(c: number, labelStyle: LabelStyle = 'letters'): string {
  if (labelStyle === 'true_false') {
    const tf = TRUE_FALSE_LETTERS[c]
    if (tf !== undefined) return tf
  }
  return CHOICE_LETTERS[c] ?? String(c + 1)
}
