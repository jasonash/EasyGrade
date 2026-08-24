import type { ApiError } from '@shared/types'

export type ErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'IO' | 'INTERNAL'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  toApiError(): ApiError {
    return { code: this.code, message: this.message, details: this.details }
  }
}
