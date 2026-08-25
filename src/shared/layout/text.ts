/**
 * Text measurement and wrapping that reproduces pdfkit's behaviour for the
 * standard Helvetica fonts: advance widths from the AFM tables (no kerning),
 * line height including the font's line gap, word wrap at spaces with
 * character-level breaking for words wider than the box.
 */

import {
  HELVETICA_BOLD_KERNS,
  HELVETICA_BOLD_WIDTHS,
  HELVETICA_KERNS,
  HELVETICA_LINE_HEIGHT,
  HELVETICA_WIDTHS
} from './helvetica-metrics'

export type Face = 'regular' | 'bold'

/** Width used for a character outside the WinAnsi set; wider than any real glyph. */
const UNKNOWN_WIDTH = 1000

export function isSupportedChar(ch: string): boolean {
  const code = ch.codePointAt(0)
  return code !== undefined && HELVETICA_WIDTHS[code] !== undefined
}

/** Characters the standard fonts cannot print, deduplicated, in order of appearance. */
export function unsupportedChars(text: string): string[] {
  const out: string[] = []
  for (const ch of text) {
    if (!isSupportedChar(ch) && !out.includes(ch)) out.push(ch)
  }
  return out
}

export function charWidth(ch: string, fontSize: number, face: Face = 'regular'): number {
  const table = face === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS
  const code = ch.codePointAt(0)
  const units = code === undefined ? UNKNOWN_WIDTH : (table[code] ?? UNKNOWN_WIDTH)
  return (units * fontSize) / 1000
}

/** Advance width of a string including pdfkit's AFM kerning between neighbours. */
export function textWidth(text: string, fontSize: number, face: Face = 'regular'): number {
  const widths = face === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS
  const kerns = face === 'bold' ? HELVETICA_BOLD_KERNS : HELVETICA_KERNS
  let units = 0
  let previous: number | undefined
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? -1
    units += widths[code] ?? UNKNOWN_WIDTH
    if (previous !== undefined) units += kerns[`${previous},${code}`] ?? 0
    previous = code
  }
  return (units * fontSize) / 1000
}

export function lineHeight(fontSize: number): number {
  return HELVETICA_LINE_HEIGHT * fontSize
}

/**
 * Wrap text into lines no wider than maxWidth. Breaks at spaces; a single
 * word wider than the box is split by character, like pdfkit's LineWrapper.
 * Collapses runs of whitespace to one space and trims the ends.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, face: Face = 'regular'): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized === '') return []
  const width = (s: string): number => textWidth(s, fontSize, face)
  const lines: string[] = []
  let line = ''

  for (const word of normalized.split(' ')) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (width(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line !== '') {
      lines.push(line)
      line = ''
    }
    if (width(word) <= maxWidth) {
      line = word
      continue
    }
    // Word wider than the box: break by character.
    for (const ch of word) {
      if (line !== '' && width(line + ch) > maxWidth) {
        lines.push(line)
        line = ''
      }
      line += ch
    }
  }
  if (line !== '') lines.push(line)
  return lines
}
