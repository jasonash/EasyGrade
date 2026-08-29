/** Custom scheme main registers for stored scan images (see src/main/scan-protocol.ts). */
export const SCAN_IMAGE_SCHEME = 'easygrade-scan'

/**
 * URL the renderer uses for a page image, thumbnail, or crop. `relative` is
 * the path stored on the scan_pages row (relative to the scans directory,
 * with either separator). `version` busts the cache after a crop is rewritten.
 */
export function scanImageUrl(relative: string, version?: string | null): string {
  const parts = relative.split(/[\\/]+/).filter((p) => p.length > 0).map(encodeURIComponent)
  const query = version ? `?v=${encodeURIComponent(version)}` : ''
  return `${SCAN_IMAGE_SCHEME}://scans/${parts.join('/')}${query}`
}

/** URL of an attachment file (normally its thumbnail) for a test; served from the attachments directory. */
export function attachmentUrl(testId: number, file: string, version?: string | null): string {
  const query = version ? `?v=${encodeURIComponent(version)}` : ''
  return `${SCAN_IMAGE_SCHEME}://attachments/${testId}/${encodeURIComponent(file)}${query}`
}
