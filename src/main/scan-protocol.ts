import { net, protocol } from 'electron'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SCAN_IMAGE_SCHEME } from '@shared/scan-url'

/**
 * Serves stored page images, thumbnails, and crops to the renderer as
 * `easygrade-scan://scans/<batchId>/<file>` so <img> tags can load them
 * without shipping PNG bytes over IPC. Paths are confined to the scans dir.
 */
export function registerScanScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCAN_IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

export function handleScanProtocol(scansDir: string): void {
  const root = resolve(scansDir)
  protocol.handle(SCAN_IMAGE_SCHEME, (request) => {
    let relative: string
    try {
      relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const full = resolve(root, relative)
    if (full === root || !full.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(full).toString(), { headers: { 'cache-control': 'no-cache' } })
  })
}
