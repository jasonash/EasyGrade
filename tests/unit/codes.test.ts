import { describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  formatQrPayload,
  generateCode,
  isValidCode,
  normalizeCode,
  parseQrPayload
} from '@shared/codes'

describe('generateCode', () => {
  it('produces 6 characters from the Crockford alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode()
      expect(code).toHaveLength(6)
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch)
      expect(isValidCode(code)).toBe(true)
    }
  })

  it('is deterministic for a given byte source', () => {
    const bytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => i)
    expect(generateCode(bytes)).toBe('012345')
  })
})

describe('normalizeCode', () => {
  it('maps confusable characters', () => {
    expect(normalizeCode(' 7kq2il ')).toBe('7KQ211')
    expect(normalizeCode('o0u')).toBe('00V')
  })
})

describe('QR payload', () => {
  it('round-trips personalized and blank payloads', () => {
    const personalized = { testCode: '7KQ2M9', studentCode: 'S4XN8B', layoutVersion: 1 }
    expect(formatQrPayload(personalized)).toBe('EG1:7KQ2M9:S4XN8B:1')
    expect(parseQrPayload('EG1:7KQ2M9:S4XN8B:1')).toEqual(personalized)

    const blank = { testCode: '7KQ2M9', studentCode: null, layoutVersion: 3 }
    expect(formatQrPayload(blank)).toBe('EG1:7KQ2M9:-:3')
    expect(parseQrPayload('EG1:7KQ2M9:-:3')).toEqual(blank)
  })

  it('rejects malformed payloads', () => {
    const bad = [
      '',
      'EG2:7KQ2M9:-:1',
      'EG1:7KQ2M9:-',
      'EG1:7KQ2M9:-:0',
      'EG1:7KQ2MI:-:1',
      'EG1:7KQ2M9:ABC:1',
      'EG1:7KQ2M9:-:1:extra',
      '{"v":1}'
    ]
    for (const raw of bad) expect(parseQrPayload(raw)).toBeNull()
  })
})
