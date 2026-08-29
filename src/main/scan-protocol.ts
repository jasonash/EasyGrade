import { net, protocol } from 'electron'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SCAN_IMAGE_SCHEME } from '@shared/scan-url'

/**
 * Serves stored page images, thumbnails, and crops to the renderer as
 * `easygrade-scan://scans/<batchId>/<file>`, and attachment thumbnails as
 * `easygrade-scan://attachments/<testId>/<file>`, so <img> tags can load
 * them without shipping PNG bytes over IPC. Each host maps to one directory
 * and paths are confined to it.
 */

export interface ImageRoots {
  scans: string
  attachments: string
}
export function registerScanScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCAN_IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

export function handleScanProtocol(roots: ImageRoots): void {
  const resolved: Record<string, string> = { scans: resolve(roots.scans), attachments: resolve(roots.attachments) }
  protocol.handle(SCAN_IMAGE_SCHEME, (request) => {
    let relative: string
    let root: string | undefined
    try {
      const url = new URL(request.url)
      root = resolved[url.hostname]
      relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    if (!root) return new Response('Not found', { status: 404 })
    const full = resolve(root, relative)
    if (full === root || !full.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(full).toString(), { headers: { 'cache-control': 'no-cache' } })
  })
}
