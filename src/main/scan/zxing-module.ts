import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareZXingModule } from 'zxing-wasm/reader'

/**
 * zxing-wasm wants to fetch its .wasm from a CDN by default. We hand it the
 * bytes from disk instead: node_modules in development, app.asar.unpacked in
 * a packaged build (package.json asarUnpack keeps the file uncompressed).
 */

let ready: Promise<void> | null = null

export function ensureZxing(): Promise<void> {
  if (!ready) {
    ready = load().catch((err: unknown) => {
      ready = null
      throw err
    })
  }
  return ready
}

async function load(): Promise<void> {
  const wasm = await readFile(locateWasm())
  const binary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)
  await prepareZXingModule({ overrides: { wasmBinary: binary }, fireImmediately: true })
}

const WASM_REL = ['node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm']

export function locateWasm(): string {
  const candidates: string[] = []
  const resourcesPath = process.resourcesPath
  if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
    candidates.push(join(resourcesPath, 'app.asar.unpacked', ...WASM_REL))
  }
  try {
    candidates.push(createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'))
  } catch {
    // the exports map may not expose it; the explicit paths below cover that
  }
  const here = dirname(fileURLToPath(import.meta.url))
  for (let up = 0; up < 5; up++) {
    candidates.push(join(here, ...Array<string>(up).fill('..'), ...WASM_REL))
  }
  candidates.push(join(process.cwd(), ...WASM_REL))
  const found = candidates.find(isFile)
  if (!found) throw new Error(`zxing_reader.wasm not found; looked in: ${candidates.join(', ')}`)
  return found
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
