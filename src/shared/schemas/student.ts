import { z } from 'zod'
import { CodeSchema, IdSchema } from './common'

export const StudentNameSchema = z.string().trim().min(1, 'Required').max(60)
export const StudentNumberSchema = z.string().trim().max(32)

export const StudentInputSchema = z.object({
  sectionId: IdSchema,
  lastName: StudentNameSchema,
  firstName: StudentNameSchema,
  studentNumber: StudentNumberSchema.optional()
})

export const StudentUpdateSchema = z.object({
  id: IdSchema,
  lastName: StudentNameSchema.optional(),
  firstName: StudentNameSchema.optional(),
  studentNumber: StudentNumberSchema.optional(),
  active: z.boolean().optional()
})

export const StudentMoveSchema = z.object({
  id: IdSchema,
  sectionId: IdSchema
})

export const StudentSchema = z.object({
  id: IdSchema,
  sectionId: IdSchema,
  code: CodeSchema,
  lastName: z.string(),
  firstName: z.string(),
  studentNumber: z.string().nullable(),
  active: z.boolean(),
  resultCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
})

/** One row of a roster import as the teacher will see it in the preview. */
export const ImportRowStatusSchema = z.enum(['new', 'duplicate', 'error'])

export const ImportRowSchema = z.object({
  line: z.number().int().positive(),
  lastName: z.string(),
  firstName: z.string(),
  studentNumber: z.string().nullable(),
  status: ImportRowStatusSchema,
  message: z.string().nullable()
})

export const ImportPreviewInputSchema = z.object({
  sectionId: IdSchema,
  text: z.string().max(1_000_000)
})

export const ImportPreviewSchema = z.object({
  rows: z.array(ImportRowSchema),
  counts: z.object({
    new: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
    error: z.number().int().nonnegative()
  })
})

/** Rows the teacher chose to import. Errors are never sent; duplicates only if they opted in. */
export const ImportCommitInputSchema = z.object({
  sectionId: IdSchema,
  rows: z
    .array(
      z.object({
        lastName: StudentNameSchema,
        firstName: StudentNameSchema,
        studentNumber: StudentNumberSchema.nullable()
      })
    )
    .max(1000)
})

export const ImportCommitResultSchema = z.object({
  created: z.number().int().nonnegative()
})

export type StudentInput = z.infer<typeof StudentInputSchema>
export type StudentUpdate = z.infer<typeof StudentUpdateSchema>
export type StudentMove = z.infer<typeof StudentMoveSchema>
export type Student = z.infer<typeof StudentSchema>
export type ImportRowStatus = z.infer<typeof ImportRowStatusSchema>
export type ImportRow = z.infer<typeof ImportRowSchema>
export type ImportPreviewInput = z.infer<typeof ImportPreviewInputSchema>
export type ImportPreview = z.infer<typeof ImportPreviewSchema>
export type ImportCommitInput = z.infer<typeof ImportCommitInputSchema>
export type ImportCommitResult = z.infer<typeof ImportCommitResultSchema>
