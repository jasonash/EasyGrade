import { z } from 'zod'

export const IdSchema = z.number().int().positive()
export const CodeSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{6}$/, 'Invalid code')
export const IsoDateSchema = z.string().datetime()

export type Id = z.infer<typeof IdSchema>
