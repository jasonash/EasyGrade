import { z } from 'zod'
import { CodeSchema, IdSchema } from './common'
import {
  MAX_CHOICES,
  MAX_CHOICE_CHARS,
  MAX_INSTRUCTIONS_CHARS,
  MAX_QUESTIONS,
  MAX_STEM_CHARS,
  MAX_TITLE_CHARS,
  MIN_CHOICES,
  MIN_QUESTIONS
} from '../layout/constants'

export const TestStatusSchema = z.enum(['draft', 'finalized'])

/** Title given to a test created without one; the editor selects it so typing replaces it. */
export const DEFAULT_TEST_TITLE = 'Untitled test'
/** Instructions a new test starts with; the editor selects them on focus so typing replaces them. */
export const DEFAULT_INSTRUCTIONS = 'Fill in one bubble completely for each question.'

export const TitleSchema = z.string().trim().min(1, 'Title is required').max(MAX_TITLE_CHARS)
export const InstructionsSchema = z.string().trim().max(MAX_INSTRUCTIONS_CHARS)
export const StemSchema = z.string().trim().min(1, 'Question text is required').max(MAX_STEM_CHARS)
export const ChoiceTextSchema = z.string().trim().min(1, 'Choice text is required').max(MAX_CHOICE_CHARS)

const correctChoiceRefinement: { message: string; path: string[] } = {
  message: 'The correct answer must be one of the choices',
  path: ['correctChoice']
}

/** While drafting, text may be blank; only the size caps apply. */
export const DraftQuestionSchema = z
  .object({
    stem: z.string().max(MAX_STEM_CHARS),
    choices: z.array(z.string().max(MAX_CHOICE_CHARS)).min(MIN_CHOICES).max(MAX_CHOICES),
    correctChoice: z.number().int().min(0)
  })
  .refine((q) => q.correctChoice < q.choices.length, correctChoiceRefinement)

/** Finalize-time rules: everything filled in. */
export const FinalQuestionSchema = z
  .object({
    stem: StemSchema,
    choices: z.array(ChoiceTextSchema).min(MIN_CHOICES).max(MAX_CHOICES),
    correctChoice: z.number().int().min(0)
  })
  .refine((q) => q.correctChoice < q.choices.length, correctChoiceRefinement)

export const FinalTestSchema = z.object({
  title: TitleSchema,
  instructions: InstructionsSchema,
  questions: z.array(FinalQuestionSchema).min(MIN_QUESTIONS).max(MAX_QUESTIONS)
})

export const TestCreateInputSchema = z.object({
  sectionId: IdSchema,
  title: z.string().trim().max(MAX_TITLE_CHARS)
})

export const TestUpdateInputSchema = z.object({
  id: IdSchema,
  title: z.string().trim().max(MAX_TITLE_CHARS),
  instructions: z.string().trim().max(MAX_INSTRUCTIONS_CHARS),
  questions: z.array(DraftQuestionSchema).min(MIN_QUESTIONS).max(MAX_QUESTIONS)
})

export const TestKeyUpdateSchema = z.object({
  id: IdSchema,
  correctChoices: z.array(z.number().int().min(0)).min(MIN_QUESTIONS).max(MAX_QUESTIONS)
})

export const TestCopyInputSchema = z.object({
  id: IdSchema,
  sectionId: IdSchema,
  title: TitleSchema.optional()
})

export const StoredQuestionSchema = z.object({
  id: IdSchema,
  position: z.number().int().nonnegative(),
  stem: z.string(),
  choices: z.array(z.string()),
  correctChoice: z.number().int().nonnegative(),
  points: z.number().int().positive()
})

export const SheetLayoutSchema = z.object({
  constantsVersion: z.number().int().positive(),
  questionCount: z.number().int().positive(),
  fontSize: z.number().positive(),
  slotHeight: z.number().positive(),
  choiceCounts: z.array(z.number().int()),
  bubbleX: z.array(z.number()),
  rowY: z.array(z.number()),
  slotTop: z.array(z.number()),
  bubbleRadius: z.number(),
  nameBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  sectionBox: z.tuple([z.number(), z.number(), z.number(), z.number()])
})

export const TestSchema = z.object({
  id: IdSchema,
  sectionId: IdSchema,
  sectionName: z.string(),
  schoolYear: z.string(),
  code: CodeSchema,
  title: z.string(),
  instructions: z.string(),
  status: TestStatusSchema,
  layoutVersion: z.number().int().positive(),
  layout: SheetLayoutSchema.nullable(),
  finalizedAt: z.string().nullable(),
  lastPrintedAt: z.string().nullable(),
  questions: z.array(StoredQuestionSchema),
  resultCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const TestSummarySchema = z.object({
  id: IdSchema,
  sectionId: IdSchema,
  sectionName: z.string(),
  schoolYear: z.string(),
  code: CodeSchema,
  title: z.string(),
  status: TestStatusSchema,
  questionCount: z.number().int().nonnegative(),
  layoutVersion: z.number().int().positive(),
  lastPrintedAt: z.string().nullable(),
  resultCount: z.number().int().nonnegative(),
  activeStudentCount: z.number().int().nonnegative(),
  updatedAt: z.string()
})

export type TestStatus = z.infer<typeof TestStatusSchema>
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>
export type TestCreateInput = z.infer<typeof TestCreateInputSchema>
export type TestUpdateInput = z.infer<typeof TestUpdateInputSchema>
export type TestKeyUpdate = z.infer<typeof TestKeyUpdateSchema>
export type TestCopyInput = z.infer<typeof TestCopyInputSchema>
export type StoredQuestion = z.infer<typeof StoredQuestionSchema>
export type Test = z.infer<typeof TestSchema>
export type TestSummary = z.infer<typeof TestSummarySchema>
