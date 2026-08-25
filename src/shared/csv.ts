/**
 * CSV writer for exports. RFC 4180 quoting, CRLF line ends, and a UTF-8 BOM
 * so Excel opens accented names correctly. Pure so it is unit-testable.
 */

export type CsvCell = string | number | null | undefined

export function csvEscape(cell: CsvCell): string {
  if (cell === null || cell === undefined) return ''
  const text = typeof cell === 'number' ? String(cell) : cell
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: CsvCell[][]): string {
  return '\ufeff' + rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n'
}

/** File-name-safe slug for a title, with a fallback. */
export function fileSlug(title: string, fallback = 'export'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)
  return slug || fallback
}
