import type { ApiResult } from '@shared/types'

export class ApiCallError extends Error {
  readonly code: string
  readonly details: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiCallError'
    this.code = code
    this.details = details
  }
}

/** Unwrap an ApiResult, throwing a typed error on failure. */
export async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.data
  throw new ApiCallError(result.error.code, result.error.message, result.error.details)
}

export const api = window.easygrade
