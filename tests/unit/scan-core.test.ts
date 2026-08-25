import { describe, expect, it } from 'vitest'
import { applyHomography, maxReprojectionError, solveHomography, warpToCanonical, type Homography } from '../../src/main/scan/homography'
import { createGray, crop, discMean, downscale, findDarkBlobs, percentile, rotate, upscale } from '../../src/main/scan/image'
import { decodePng, encodePng } from '../../src/main/scan/png'
import { decideBucket } from '../../src/main/scan/pipeline'
import { classifyRow } from '../../src/main/scan/stages/omr'
import { RASTER_MAX_SHORT_SIDE, RASTER_SHORT_SIDE, mimeForFile, rasterScale } from '../../src/main/scan/stages/rasterize'
import { rotationFromHomography } from '../../src/main/scan/stages/marks'
import { T_BLANK, T_FILL, T_SECOND } from '../../src/main/scan/thresholds'

describe('homography', () => {
  const truth: Homography = [2.1, 0.05, 40, -0.03, 2.2, 55, 0.00001, 0.00002, 1]
  const points = [
    { x: 35, y: 35 },
    { x: 577, y: 35 },
    { x: 577, y: 757 },
    { x: 35, y: 757 },
    { x: 300, y: 400 },
    { x: 487, y: 60 }
  ]

  it('recovers a known transform from four correspondences', () => {
    const pairs = points.slice(0, 4).map((p) => ({ from: p, to: applyHomography(truth, p) }))
    const h = solveHomography(pairs)
    for (const p of points) {
      const want = applyHomography(truth, p)
      const got = applyHomography(h, p)
      expect(Math.hypot(want.x - got.x, want.y - got.y)).toBeLessThan(1e-6)
    }
  })

  it('fits six noisy correspondences in the least-squares sense', () => {
    const pairs = points.map((p, i) => {
      const to = applyHomography(truth, p)
      return { from: p, to: { x: to.x + (i % 2 ? 0.3 : -0.3), y: to.y + (i % 3 ? 0.2 : -0.2) } }
    })
    const h = solveHomography(pairs)
    expect(maxReprojectionError(h, pairs)).toBeLessThan(1)
  })

  it('rejects degenerate input', () => {
    const line = [0, 1, 2, 3].map((i) => ({ from: { x: i, y: i }, to: { x: i * 2, y: i * 2 } }))
    expect(() => solveHomography(line)).toThrow()
    expect(() => solveHomography(line.slice(0, 3))).toThrow(RangeError)
  })

  it('warps a scaled page back to canonical size', () => {
    // A 300x400 source that is the "sheet" scaled by 0.5 with a dark square at sheet (100..200, 100..200).
    const src = createGray(306, 396)
    for (let y = 50; y < 100; y++) for (let x = 50; x < 100; x++) src.data[y * src.width + x] = 0
    const h: Homography = [0.5, 0, 0, 0, 0.5, 0, 0, 0, 1]
    const out = warpToCanonical(src, h, 1224, 1584, 2)
    expect(out.data[250 * 1224 + 250]).toBe(0)
    expect(out.data[150 * 1224 + 150]).toBe(255)
    expect(out.data[450 * 1224 + 450]).toBe(255)
  })

  it('reads the page rotation off the sheet x axis', () => {
    expect(rotationFromHomography([1, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(0)
    expect(rotationFromHomography([-1, 0, 600, 0, -1, 800, 0, 0, 1])).toBe(180)
    // Sheet x axis pointing down in the image: the image was turned 90 clockwise, so turn 270 more.
    expect(rotationFromHomography([0, -1, 800, 1, 0, 0, 0, 0, 1])).toBe(270)
    expect(rotationFromHomography([0, 1, 0, -1, 0, 600, 0, 0, 1])).toBe(90)
  })
})

describe('image operations', () => {
  function tiny(): ReturnType<typeof createGray> {
    const img = createGray(3, 2)
    img.data.set([1, 2, 3, 4, 5, 6])
    return img
  }

  it('rotates by quarter turns', () => {
    expect([...rotate(tiny(), 90).data]).toEqual([4, 1, 5, 2, 6, 3])
    expect([...rotate(tiny(), 180).data]).toEqual([6, 5, 4, 3, 2, 1])
    expect([...rotate(tiny(), 270).data]).toEqual([3, 6, 2, 5, 1, 4])
    expect([...rotate(rotate(tiny(), 90), 270).data]).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('crops, scales and measures', () => {
    const img = createGray(8, 8)
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) img.data[y * 8 + x] = 0
    const c = crop(img, { x: 2, y: 2, width: 4, height: 4 })
    expect(c.width).toBe(4)
    expect([...c.data].every((v) => v === 0)).toBe(true)
    expect(downscale(img, 2).data[9]).toBe(0)
    expect(downscale(img, 2).data[0]).toBe(255)
    expect(upscale(c, 2).width).toBe(8)
    expect(percentile(img, { x: 0, y: 0, width: 8, height: 8 }, 50)).toBe(255)
    expect(percentile(img, { x: 2, y: 2, width: 4, height: 4 }, 50)).toBe(0)
    expect(discMean(img, 3.5, 3.5, 1.5)).toBe(0)
    expect(discMean(img, 0, 0, 1)).toBe(255)
  })

  it('finds connected dark blobs with centroids', () => {
    const img = createGray(40, 40)
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) img.data[y * 40 + x] = 0
    for (let y = 20; y < 30; y++) for (let x = 25; x < 30; x++) img.data[y * 40 + x] = 40
    const blobs = findDarkBlobs(img, { x: 0, y: 0, width: 40, height: 40 }, 128).sort((a, b) => a.cx - b.cx)
    expect(blobs).toHaveLength(2)
    expect(blobs[0]?.areaPx).toBe(100)
    expect(blobs[0]?.cx).toBeCloseTo(9.5)
    expect(blobs[0]?.cy).toBeCloseTo(9.5)
    expect(blobs[1]?.areaPx).toBe(50)
    expect(blobs[1]?.minX).toBe(25)
    expect(blobs[1]?.maxY).toBe(29)
  })

  it('round-trips PNG encoding', () => {
    const img = createGray(5, 3)
    for (let i = 0; i < 15; i++) img.data[i] = i * 17
    const back = decodePng(encodePng(img))
    expect(back.width).toBe(5)
    expect([...back.data]).toEqual([...img.data])
  })
})

describe('rasterize helpers', () => {
  it('maps file names to mime types', () => {
    expect(mimeForFile('scan.PDF')).toBe('application/pdf')
    expect(mimeForFile('photo.jpeg')).toBe('image/jpeg')
    expect(mimeForFile('notes.docx')).toBeNull()
  })

  it('renders point-sized pages up to 200 DPI and caps phone photos', () => {
    expect(rasterScale(612, 792)).toBeCloseTo(RASTER_SHORT_SIDE / 612)
    expect(rasterScale(3024, 4032)).toBeCloseTo(RASTER_MAX_SHORT_SIDE / 3024)
    expect(rasterScale(2000, 2600)).toBe(1)
    expect(rasterScale(792, 612)).toBeCloseTo(RASTER_SHORT_SIDE / 612)
  })
})

describe('row classification', () => {
  it('follows the threshold table', () => {
    expect(classifyRow(0, [0.02, T_FILL + 0.2, 0.01, 0.0])).toMatchObject({ state: 'filled', choice: 1 })
    expect(classifyRow(0, [T_BLANK - 0.05, 0.01])).toMatchObject({ state: 'blank', choice: null })
    expect(classifyRow(0, [T_FILL + 0.3, T_SECOND + 0.2, 0, 0])).toMatchObject({ state: 'multiple', choice: null })
    expect(classifyRow(0, [T_FILL - 0.03, 0, 0])).toMatchObject({ state: 'ambiguous', choice: null })
    expect(classifyRow(0, [0, 0, 0, 0]).confidence).toBe(1)
  })

  it('keeps the fills and question index on the row', () => {
    const row = classifyRow(4, [0.9, 0.1, 0.0])
    expect(row.q).toBe(4)
    expect(row.fills).toEqual([0.9, 0.1, 0.0])
    expect(row.confidence).toBeGreaterThan(0)
    expect(row.confidence).toBeLessThanOrEqual(1)
  })
})

describe('bucketing', () => {
  const base = {
    marksFound: true,
    sawCandidates: true,
    qrDecoded: true,
    testKnown: true,
    layoutUsable: true,
    studentCode: 'ABCDEF',
    studentKnown: true,
    studentInSection: true
  }

  it('grades a page with marks, a QR, and a rostered student', () => {
    expect(decideBucket(base)).toEqual({ bucket: 'graded', reason: null })
  })

  it('sends blank sheets and roster mismatches to assignment', () => {
    expect(decideBucket({ ...base, studentCode: null })).toEqual({ bucket: 'needs_assignment', reason: 'blank_sheet' })
    expect(decideBucket({ ...base, studentKnown: false, studentInSection: false })).toEqual({ bucket: 'needs_assignment', reason: 'roster_mismatch' })
    expect(decideBucket({ ...base, studentInSection: false })).toEqual({ bucket: 'needs_assignment', reason: 'roster_mismatch' })
    expect(decideBucket({ ...base, testKnown: false, layoutUsable: false })).toEqual({ bucket: 'needs_assignment', reason: 'unknown_test' })
    expect(decideBucket({ ...base, marksFound: false })).toEqual({ bucket: 'needs_assignment', reason: 'alignment' })
  })

  it('marks unreadable and not-a-sheet pages', () => {
    expect(decideBucket({ ...base, qrDecoded: false })).toEqual({ bucket: 'unreadable', reason: 'qr' })
    expect(decideBucket({ ...base, layoutUsable: false })).toEqual({ bucket: 'unreadable', reason: 'layout' })
    expect(decideBucket({ ...base, marksFound: false, qrDecoded: false })).toEqual({ bucket: 'unreadable', reason: 'alignment' })
    expect(decideBucket({ ...base, marksFound: false, qrDecoded: false, sawCandidates: false })).toEqual({ bucket: 'not_a_sheet', reason: null })
  })
})
