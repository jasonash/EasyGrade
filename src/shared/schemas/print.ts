import { z } from 'zod'
import { IdSchema } from './common'

export const MAX_BLANK_COPIES = 50
export const MAX_DATE_LABEL_CHARS = 40

/**
 * What the Print dialog sends. `studentIds: null` means every active student
 * in the test's section; an explicit list may include inactive students
 * (make-up sheets) as long as they belong to the section.
 */
export const PrintRequestSchema = z.object({
  testId: IdSchema,
  studentIds: z.array(IdSchema).nullable(),
  blankCount: z.number().int().min(0).max(MAX_BLANK_COPIES),
  dateLabel: z.string().trim().max(MAX_DATE_LABEL_CHARS).nullable()
})

export const PrintRunSchema = z.object({
  id: IdSchema,
  testId: IdSchema,
  layoutVersion: z.number().int().positive(),
  dateLabel: z.string().nullable(),
  studentIds: z.array(IdSchema),
  blankCount: z.number().int().nonnegative(),
  printedAt: z.string()
})

/** Outcome of generating (and optionally saving or opening) a PDF. */
export const PrintOutcomeSchema = z.object({
  /** Where the PDF was written. */
  path: z.string(),
  pageCount: z.number().int().positive(),
  studentCount: z.number().int().nonnegative(),
  blankCount: z.number().int().nonnegative(),
  /** Set when the run was recorded (save and print); absent for previews. */
  printRun: PrintRunSchema.nullable()
})

export type PrintRequest = z.infer<typeof PrintRequestSchema>
export type PrintRun = z.infer<typeof PrintRunSchema>
export type PrintOutcome = z.infer<typeof PrintOutcomeSchema>
