import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { processPage } from '../../src/main/scan/pipeline'
import { mimeForFile, rasterize } from '../../src/main/scan/stages/rasterize'
import { contextFromManifest, expectedBucket, judgeRows, type Manifest } from '../helpers/fixture-context'

/**
 * Regression test over the real scans in tests/fixtures/real (gitignored;
 * see tests/fixtures/SCAN_CHECKLIST.md). Every manifest file that exists
 * on this machine is rasterized and run through the pipeline; each page's
 * QR, bucket, and per-row outcomes are checked against the manifest. The
 * whole suite is skipped when the fixture directory is absent (CI).
 */

const root = resolve(__dirname, '..', '..')
const fixtureDir = join(root, 'tests', 'fixtures', 'real')
const manifestPath = join(root, 'tests', 'fixtures', 'real-manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
const ctx = contextFromManifest(manifest)
const present = manifest.files.filter((f) => existsSync(join(fixtureDir, f.file)))

describe.skipIf(present.length === 0)('real scan fixtures', () => {
  for (const entry of present) {
    it(`${entry.file} (${entry.device}, ${entry.pages.length} page${entry.pages.length === 1 ? '' : 's'})`, async () => {
      const mime = mimeForFile(entry.file)
      expect(mime).not.toBeNull()
      const rasters = rasterize(readFileSync(join(fixtureDir, entry.file)), mime ?? 'application/pdf')
      expect(rasters).toHaveLength(entry.pages.length)

      for (const raster of rasters) {
        const sheetId = entry.pages[raster.index] ?? ''
        const sheet = manifest.sheets.find((s) => s.id === sheetId)
        expect(sheet, `manifest sheet ${sheetId}`).toBeDefined()
        if (!sheet) continue
        const label = `${entry.file} p${raster.index + 1} (${sheet.id})`

        const { result, canonical, thumbnail } = await processPage({ pageIndex: raster.index, image: raster.image }, ctx)
        expect(result.elapsedMs, `${label} elapsed`).toBeLessThan(3000)
        expect(thumbnail.width).toBeLessThanOrEqual(300)

        expect(result.qr?.payload.testCode ?? null, `${label} test code`).toBe(sheet.testCode)
        expect(result.qr?.payload.studentCode ?? null, `${label} student code`).toBe(sheet.studentCode)
        expect(result.bucket, `${label} bucket (${result.reason ?? 'no reason'})`).toBe(expectedBucket(sheet))

        if (sheet.bucket === 'not-a-sheet') {
          expect(canonical).toBeNull()
          continue
        }
        expect(result.alignment.marks, `${label} marks`).toHaveLength(4)
        expect(result.alignment.quality, `${label} alignment`).not.toBe('failed')
        expect(canonical?.width).toBe(1224)
        expect(canonical?.height).toBe(1584)
        expect(result.rotation, `${label} rotation`).not.toBeNull()

        if (sheet.test) {
          const test = manifest.tests[sheet.test]
          expect(result.answers, `${label} answers`).not.toBeNull()
          if (!result.answers) continue
          expect(result.answers).toHaveLength(test.rows.length)
          const verdicts = judgeRows(result.answers, sheet, test)
          const failures = verdicts.filter((v) => !v.ok).map((v) => `q${v.q + 1} got ${v.outcome}, accept ${v.expected.join('|')} (review ${v.review})`)
          expect(failures, `${label} rows`).toEqual([])
        }
      }
    })
  }
})
