import { readFile } from 'node:fs/promises'
import { parentPort } from 'node:worker_threads'
import { resizeToWidth } from './image'
import { processPage } from './pipeline'
import { encodePng } from './png'
import { countPages, mimeForFile, rasterize } from './stages/rasterize'
import { CANONICAL_WIDTH } from './thresholds'
import type { ScanJob, WorkerMessage } from './worker-protocol'

/**
 * Scan worker thread. Receives one ScanJob, rasterizes each file page by
 * page, runs the pipeline, and streams results back as PNG bytes. Nothing
 * here touches the database.
 */

const port = parentPort
if (!port) throw new Error('scan worker must run in a worker thread')

function post(message: WorkerMessage, transfer: ArrayBuffer[] = []): void {
  port?.postMessage(message, transfer)
}

/** Copy out of Node's shared Buffer pool into a standalone ArrayBuffer that can be transferred whole. */
function bytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(buffer.byteLength))
  out.set(buffer)
  return out
}

async function runJob(job: ScanJob): Promise<void> {
  for (const file of job.files) {
    const mime = mimeForFile(file.name)
    if (!mime) {
      post({ type: 'file-error', file: file.name, message: 'Unsupported file type' })
      continue
    }
    let buffer: Buffer
    let pageCount: number
    try {
      buffer = await readFile(file.path)
      pageCount = countPages(buffer, mime)
    } catch (err) {
      post({ type: 'file-error', file: file.name, message: err instanceof Error ? err.message : String(err) })
      continue
    }
    post({ type: 'file', file: file.name, pageCount })

    for (let i = 0; i < pageCount; i++) {
      try {
        const [raster] = rasterize(buffer, mime, [i])
        if (!raster) throw new Error(`Page ${i + 1} did not render`)
        const output = await processPage({ pageIndex: i, image: raster.image }, job.ctx)
        const image = bytes(encodePng(output.canonical ?? resizeToWidth(raster.image, CANONICAL_WIDTH)))
        const thumbnail = bytes(encodePng(output.thumbnail))
        const crops: Record<string, Uint8Array<ArrayBuffer>> = {}
        for (const [name, img] of Object.entries(output.crops)) crops[name] = bytes(encodePng(img))
        const transfer: ArrayBuffer[] = [image.buffer, thumbnail.buffer, ...Object.values(crops).map((c) => c.buffer)]
        post({ type: 'page', file: file.name, fileIndex: i, result: output.result, image, thumbnail, crops }, transfer)
      } catch (err) {
        post({ type: 'file-error', file: `${file.name} page ${i + 1}`, message: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  post({ type: 'done' })
}

port.on('message', (job: ScanJob) => {
  runJob(job).catch((err: unknown) => {
    post({ type: 'fatal', message: err instanceof Error ? err.message : String(err) })
  })
})
