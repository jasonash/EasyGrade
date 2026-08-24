import { ipcMain } from 'electron'
import { ZodError } from 'zod'
import type { ApiError, ApiResult } from '@shared/types'
import { AppError } from '../services/errors'

/**
 * Register an invoke handler that wraps its result in the ApiResult envelope.
 * Nothing thrown inside a handler ever crosses the bridge as a rejection.
 */
export function handle<Args extends unknown[], R>(
  channel: string,
  fn: (...args: Args) => R | Promise<R>
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<ApiResult<R>> => {
    try {
      const data = await fn(...(args as Args))
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: toApiError(err) }
    }
  })
}

function toApiError(err: unknown): ApiError {
  if (err instanceof AppError) return err.toApiError()
  if (err instanceof ZodError) {
    const first = err.issues[0]
    const message = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input'
    return { code: 'VALIDATION', message, details: err.issues }
  }
  const message = err instanceof Error ? err.message : String(err)
  console.error('[ipc] unhandled error:', err)
  return { code: 'INTERNAL', message }
}
