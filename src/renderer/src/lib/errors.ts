import { ApiCallError } from '@/api'

export function describeError(err: unknown): string {
  if (err instanceof ApiCallError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
