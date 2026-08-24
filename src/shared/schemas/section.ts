import { z } from 'zod'
import { IdSchema } from './common'

export const SectionNameSchema = z.string().trim().min(1, 'Name is required').max(80)
export const SchoolYearSchema = z.string().trim().max(20)

export const SectionInputSchema = z.object({
  name: SectionNameSchema,
  schoolYear: SchoolYearSchema
})

export const SectionUpdateSchema = z.object({
  id: IdSchema,
  name: SectionNameSchema.optional(),
  schoolYear: SchoolYearSchema.optional(),
  archived: z.boolean().optional()
})

export const SectionSchema = z.object({
  id: IdSchema,
  name: SectionNameSchema,
  schoolYear: z.string(),
  archived: z.boolean(),
  studentCount: z.number().int().nonnegative(),
  testCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export type SectionInput = z.infer<typeof SectionInputSchema>
export type SectionUpdate = z.infer<typeof SectionUpdateSchema>
export type Section = z.infer<typeof SectionSchema>
