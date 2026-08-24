/**
 * Short codes and QR payloads.
 *
 * Codes are 6-character Crockford base32 (no I, L, O, U) so they survive
 * printing and can be read back by a human. The QR payload format is
 *   EG1:<testCode>:<studentCode|->:<layoutVersion>
 */

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 6
export const CODE_REGEX = /^[0-9A-HJKMNP-TV-Z]{6}$/
export const QR_PREFIX = 'EG1'

export interface QrPayload {
  testCode: string
  studentCode: string | null
  layoutVersion: number
}

/** Generate a random code using the supplied byte source (defaults to crypto). */
export function generateCode(randomBytes: (n: number) => Uint8Array = defaultRandomBytes): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    const b = bytes[i] ?? 0
    out += CODE_ALPHABET.charAt(b % CODE_ALPHABET.length)
  }
  return out
}

function defaultRandomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n)
  globalThis.crypto.getRandomValues(arr)
  return arr
}

export function isValidCode(value: string): boolean {
  return CODE_REGEX.test(value)
}

/** Normalize user-typed codes: uppercase, and map the confusable letters. */
export function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
}

export function formatQrPayload(payload: QrPayload): string {
  const student = payload.studentCode ?? '-'
  return `${QR_PREFIX}:${payload.testCode}:${student}:${payload.layoutVersion}`
}

/** Strict parser. Returns null for anything that is not a well-formed EasyGrade payload. */
export function parseQrPayload(raw: string): QrPayload | null {
  const parts = raw.trim().split(':')
  if (parts.length !== 4) return null
  const [prefix, testCode, studentPart, versionPart] = parts
  if (prefix !== QR_PREFIX) return null
  if (testCode === undefined || !isValidCode(testCode)) return null
  if (studentPart === undefined || versionPart === undefined) return null
  const studentCode = studentPart === '-' ? null : studentPart
  if (studentCode !== null && !isValidCode(studentCode)) return null
  if (!/^[1-9][0-9]*$/.test(versionPart)) return null
  return { testCode, studentCode, layoutVersion: Number(versionPart) }
}
