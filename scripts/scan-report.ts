/**
 * Run every real fixture scan through the pipeline and print a per-page
 * report against tests/fixtures/real-manifest.json. Threshold tuning tool.
 *
 *   npm run scan:report                 all files
 *   npm run scan:report -- scansnap     files whose name contains "scansnap"
 *   SCAN_REPORT_OUT=dir npm run scan:report   also write canonical PNGs and crops
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { processPage } from '../src/main/scan/pipeline'
import { encodePng } from '../src/main/scan/png'
import { mimeForFile, rasterize } from '../src/main/scan/stages/rasterize'
import { contextFromManifest, expectedBucket, judgeRows, type Manifest } from '../tests/helpers/fixture-context'

const root = resolve(import.meta.dirname, '..')
const fixtureDir = join(root, 'tests', 'fixtures', 'real')
const manifest = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'real-manifest.json'), 'utf8')) as Manifest
const ctx = contextFromManifest(manifest)
const filter = process.argv[2] ?? ''
const outDir = process.env.SCAN_REPORT_OUT
if (outDir) mkdirSync(outDir, { recursive: true })

let pages = 0
let pageFails = 0
let rows = 0
let rowFails = 0
let rowIdeal = 0

for (const entry of manifest.files) {
  if (filter && !entry.file.includes(filter)) continue
  const path = join(fixtureDir, entry.file)
  if (!existsSync(path)) {
    console.log(`SKIP ${entry.file} (missing)`)
    continue
  }
  const mime = mimeForFile(entry.file)
  if (!mime) {
    console.log(`SKIP ${entry.file} (unsupported)`)
    continue
  }
  const t0 = performance.now()
  const rasters = rasterize(readFileSync(path), mime)
  const rasterMs = Math.round(performance.now() - t0)
  console.log(`\n${entry.file}  ${rasters.length} page(s), rasterized in ${rasterMs} ms  [${entry.device}]`)
  for (const raster of rasters) {
    const sheetId = entry.pages[raster.index] ?? '?'
    const sheet = manifest.sheets.find((s) => s.id === sheetId)
    const out = await processPage({ pageIndex: raster.index, image: raster.image }, ctx)
    const r = out.result
    pages++
    const qrText = r.qr ? `${r.qr.raw} (${r.qr.strategy})` : 'none'
    const align = `${r.alignment.method}/${r.alignment.marks.length} marks ${r.alignment.quality}${r.alignment.residual !== null ? ` res=${r.alignment.residual}` : ''}`
    const wantBucket = sheet ? expectedBucket(sheet) : '?'
    const bucketOk = r.bucket === wantBucket
    const qrOk = sheet ? (r.qr?.payload.testCode ?? null) === sheet.testCode && (r.qr?.payload.studentCode ?? null) === sheet.studentCode : true
    if (!bucketOk || !qrOk) pageFails++
    console.log(
      `  p${raster.index + 1} ${sheetId.padEnd(2)} ${r.sourceWidth}x${r.sourceHeight} rot=${r.rotation ?? '?'} qr=${qrText} ${align} -> ${r.bucket}${r.reason ? `/${r.reason}` : ''} ${bucketOk && qrOk ? 'OK' : `EXPECTED ${wantBucket} ${qrOk ? '' : 'QR MISMATCH'}`} flags=[${r.flags.join(',')}] ${r.elapsedMs} ms`
    )
    const marks = r.alignment.marks.map((m) => `${m.corner}:${m.fillRatio.toFixed(2)}`).join(' ')
    if (marks) console.log(`     marks ${marks}`)
    if (sheet?.test && r.answers) {
      const test = manifest.tests[sheet.test]
      const verdicts = judgeRows(r.answers, sheet, test)
      for (const v of verdicts) {
        const row = r.answers[v.q]
        rows++
        if (!v.ok) rowFails++
        if (v.ideal) rowIdeal++
        const fills = row ? row.fills.map((f) => f.toFixed(2)).join(' ') : ''
        console.log(
          `     q${String(v.q + 1).padStart(2)} ${v.ok ? (v.ideal ? '  ' : '~ ') : 'XX'} ${String(v.outcome).padEnd(9)} want ${v.expected.join('|').padEnd(12)} review=${v.review.padEnd(6)} ${row?.state.padEnd(9) ?? ''} conf=${row?.confidence.toFixed(2) ?? ''} [${fills}]`
        )
      }
    }
    if (outDir) {
      const base = `${entry.file.replace(/\.[^.]+$/, '')}_p${raster.index + 1}`
      if (out.canonical) writeFileSync(join(outDir, `${base}.canonical.png`), encodePng(out.canonical))
      writeFileSync(join(outDir, `${base}.thumb.png`), encodePng(out.thumbnail))
      for (const [name, img] of Object.entries(out.crops)) writeFileSync(join(outDir, `${base}.${name}.png`), encodePng(img))
    }
  }
}

console.log(`\nPages: ${pages}, page failures: ${pageFails}. Rows: ${rows}, row failures: ${rowFails}, ideal: ${rowIdeal}.`)
process.exit(pageFails + rowFails > 0 ? 1 : 0)
