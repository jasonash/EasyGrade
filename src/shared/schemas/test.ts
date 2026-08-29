import { z } from 'zod'
import { CodeSchema, IdSchema } from './common'
import {
  MAX_BUBBLES,
  MAX_CHOICES,
  MAX_CHOICE_CHARS,
  MAX_INSTRUCTIONS_CHARS,
  MAX_QUESTIONS,
  MAX_SHEET_QUESTIONS,
  MAX_STEM_CHARS,
  MAX_TITLE_CHARS,
  MIN_BUBBLES,
  MIN_CHOICES,
  MIN_QUESTIONS
} from '../layout/constants'

export const TestStatusSchema = z.enum(['draft', 'finalized'])
/** standard: questions printed on the sheet. answer_sheet: bubbles only, the test lives elsewhere. */
export const TestKindSchema = z.enum(['standard', 'answer_sheet'])
/** How an answer-sheet row labels its bubbles. true_false needs exactly two bubbles. */
export const LabelStyleSchema = z.enum(['letters', 'true_false'])
export const MAX_LINK_URL_CHARS = 2048
/** Default bubbles per question for a new answer sheet, and how many rows it starts with. */
export const DEFAULT_BUBBLE_COUNT = 5
export const DEFAULT_ANSWER_SHEET_QUESTIONS = 10

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
  title: z.string().trim().max(MAX_TITLE_CHARS),
  /** Missing means standard. */
  kind: TestKindSchema.optional(),
  /** Answer sheets only: bubbles per question (DEFAULT_BUBBLE_COUNT when missing). */
  defaultChoiceCount: z.number().int().min(MIN_BUBBLES).max(MAX_BUBBLES).optional(),
  /** Answer sheets only: rows to start with (DEFAULT_ANSWER_SHEET_QUESTIONS when missing). */
  questionCount: z.number().int().min(MIN_QUESTIONS).max(MAX_SHEET_QUESTIONS).optional()
})

export const LinkUrlSchema = z
  .string()
  .trim()
  .max(MAX_LINK_URL_CHARS)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Link must start with http:// or https://')

/** One row of an answer sheet: how many bubbles, which is correct, how they are labeled. */
export const AnswerSheetQuestionSchema = z
  .object({
    choiceCount: z.number().int().min(MIN_BUBBLES).max(MAX_BUBBLES),
    correctChoice: z.number().int().min(0),
    labelStyle: LabelStyleSchema,
    /** Set by hand in the editor; such rows keep their count when the default changes. */
    countOverridden: z.boolean()
  })
  .refine((q) => q.correctChoice < q.choiceCount, correctChoiceRefinement)
  .refine((q) => q.labelStyle !== 'true_false' || q.choiceCount === 2, {
    message: 'True/false rows have exactly two bubbles',
    path: ['labelStyle']
  })

export const AnswerSheetUpdateInputSchema = z
  .object({
    id: IdSchema,
    title: z.string().trim().max(MAX_TITLE_CHARS),
    instructions: z.string().trim().max(MAX_INSTRUCTIONS_CHARS),
    linkUrl: LinkUrlSchema,
    defaultChoiceCount: z.number().int().min(MIN_BUBBLES).max(MAX_BUBBLES),
    questions: z.array(AnswerSheetQuestionSchema).min(MIN_QUESTIONS).max(MAX_SHEET_QUESTIONS)
  })
  .refine((t) => t.questions.every((q) => q.choiceCount <= t.defaultChoiceCount), {
    message: 'A question cannot have more bubbles than the default',
    path: ['questions']
  })

export const TestAttachmentSchema = z.object({
  fileName: z.string(),
  storedName: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  addedAt: z.string(),
  /** Stored thumbnail file name, or null when none could be made. */
  thumb: z.string().nullable()
})

export const TestUpdateInputSchema = z.object({
  id: IdSchema,
  title: z.string().trim().max(MAX_TITLE_CHARS),
  instructions: z.string().trim().max(MAX_INSTRUCTIONS_CHARS),
  questions: z.array(DraftQuestionSchema).min(MIN_QUESTIONS).max(MAX_QUESTIONS)
})

export const TestKeyUpdateSchema = z.object({
  id: IdSchema,
  correctChoices: z.array(z.number().int().min(0)).min(MIN_QUESTIONS).max(MAX_SHEET_QUESTIONS)
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
  points: z.number().int().positive(),
  labelStyle: LabelStyleSchema,
  countOverridden: z.boolean()
})

export const AnswerCellSchema = z.object({
  column: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
  y: z.number(),
  x: z.array(z.number())
})

export const SheetLayoutSchema = z.object({
  constantsVersion: z.number().int().positive(),
  kind: TestKindSchema.optional(),
  questionCount: z.number().int().positive(),
  fontSize: z.number().positive(),
  slotHeight: z.number().positive(),
  choiceCounts: z.array(z.number().int()),
  bubbleX: z.array(z.number()),
  rowY: z.array(z.number()),
  slotTop: z.array(z.number()),
  bubbleRadius: z.number(),
  nameBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  sectionBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  columns: z.number().int().positive().optional(),
  rowPitch: z.number().positive().optional(),
  cells: z.array(AnswerCellSchema).optional()
})

export const TestSchema = z.object({
  id: IdSchema,
  sectionId: IdSchema,
  sectionName: z.string(),
  schoolYear: z.string(),
  code: CodeSchema,
  kind: TestKindSchema,
  title: z.string(),
  instructions: z.string(),
  status: TestStatusSchema,
  /** Answer sheets: bubbles per question by default. Null for standard tests. */
  defaultChoiceCount: z.number().int().nullable(),
  linkUrl: z.string().nullable(),
  attachment: TestAttachmentSchema.nullable(),
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
  kind: TestKindSchema,
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
export type TestKind = z.infer<typeof TestKindSchema>
export type LabelStyle = z.infer<typeof LabelStyleSchema>
export type AnswerSheetQuestionInput = z.infer<typeof AnswerSheetQuestionSchema>
export type AnswerSheetUpdateInput = z.infer<typeof AnswerSheetUpdateInputSchema>
export type TestAttachment = z.infer<typeof TestAttachmentSchema>
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>
export type TestCreateInput = z.infer<typeof TestCreateInputSchema>
export type TestUpdateInput = z.infer<typeof TestUpdateInputSchema>
export type TestKeyUpdate = z.infer<typeof TestKeyUpdateSchema>
export type TestCopyInput = z.infer<typeof TestCopyInputSchema>
export type StoredQuestion = z.infer<typeof StoredQuestionSchema>
export type Test = z.infer<typeof TestSchema>
export type TestSummary = z.infer<typeof TestSummarySchema>
