import { PAGE_WIDTH, QR_SIZE, QR_X, QR_Y, REG_MARK_CENTERS, REG_MARK_SIZE } from '@shared/layout'
import type { MarkCorner, MarkDetection, Point, QrDetection } from '@shared/schemas'
import { applyHomography, solveHomography, type Homography } from '../homography'
import { findDarkBlobs, percentile, type Blob, type GrayImage, type Rect } from '../image'
import {
  CORNER_WINDOW_FRACTION,
  MARK_AREA_MAX,
  MARK_AREA_MIN,
  MARK_ASPECT_MAX,
  MARK_CIRCLE_MAX_RATIO,
  MARK_MIN_CONTRAST,
  MARK_MIN_FILL_RATIO,
  MARK_WINDOW_FACTOR
} from '../thresholds'

/**
 * Locate the four registration marks. Two routes:
 *
 * 1. QR-anchored. The QR's four corners sit at known sheet coordinates, so
 *    they give a first homography that predicts where each mark is in the
 *    image, wherever the page sits in the frame and however it is rotated.
 *    Each prediction is refined to the centroid of the dark blob nearest it.
 * 2. Corner windows. Without a QR, look in the image's own corners (which
 *    only works when the scan is roughly the page) and use the one circle
 *    among three squares to work out the rotation.
 */

export const CORNERS: readonly MarkCorner[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']

export interface MarkSearch {
  marks: MarkDetection[]
  method: 'qr' | 'corners' | 'none'
  /** Clockwise rotation (0/90/180/270) that brings the page upright; null when unknown. */
  rotation: number | null
  /** Whether any mark-sized dark blob was seen at all (separates "not a sheet" from "unreadable"). */
  sawCandidates: boolean
}

/** Sheet-space corners of the printed QR symbol, matching zxing's symbol-frame order. */
export const QR_SHEET_CORNERS = {
  topLeft: { x: QR_X, y: QR_Y },
  topRight: { x: QR_X + QR_SIZE, y: QR_Y },
  bottomRight: { x: QR_X + QR_SIZE, y: QR_Y + QR_SIZE },
  bottomLeft: { x: QR_X, y: QR_Y + QR_SIZE }
} as const

export function markCenter(corner: MarkCorner): Point {
  const [x, y] = REG_MARK_CENTERS[corner]
  return { x, y }
}

export function findMarks(img: GrayImage, qr: QrDetection | null): MarkSearch {
  if (qr?.position) {
    const anchored = findMarksFromQr(img, qr.position)
    if (anchored) return anchored
  }
  return findMarksFromCorners(img)
}

/** Homography from sheet points to image pixels using only the QR corners. */
export function qrHomography(position: NonNullable<QrDetection['position']>): Homography | null {
  try {
    return solveHomography(
      CORNERS.map((c) => ({ from: QR_SHEET_CORNERS[c], to: position[c] }))
    )
  } catch {
    return null
  }
}

function findMarksFromQr(img: GrayImage, position: NonNullable<QrDetection['position']>): MarkSearch | null {
  const h0 = qrHomography(position)
  if (!h0) return null
  const pxPerPt = Math.hypot(position.topRight.x - position.topLeft.x, position.topRight.y - position.topLeft.y) / QR_SIZE
  if (!Number.isFinite(pxPerPt) || pxPerPt < 0.5) return null

  // The QR-only homography is accurate near the QR and drifts badly 700 pt
  // away, so anchor progressively: the two top marks from the QR, then the
  // bottom marks from a similarity fit on the top pair, then the last one
  // from an affine fit on three. Nearest to the QR first.
  const order: MarkCorner[] = ['topRight', 'topLeft', 'bottomRight', 'bottomLeft']
  const found = new Map<MarkCorner, MarkDetection>()
  let sawCandidates = false
  for (const corner of order) {
    const prediction = predictMark(corner, found, h0, position)
    const half = prediction.windowFactor * REG_MARK_SIZE * pxPerPt + (prediction.extraHalf ?? 0)
    const r = refineMark(img, corner, prediction.point, pxPerPt, half)
    if (r.candidates > 0) sawCandidates = true
    if (r.mark) found.set(corner, r.mark)
  }
  const marks = CORNERS.filter((c) => found.has(c)).map((c) => found.get(c) as MarkDetection)
  return { marks, method: 'qr', rotation: rotationFromHomography(h0), sawCandidates }
}

interface Prediction {
  point: Point
  /** Search window half-size as a multiple of the mark size; wider when the model is weaker. */
  windowFactor: number
  /** Extra half-size in pixels when two models disagree. */
  extraHalf?: number
}

function predictMark(
  corner: MarkCorner,
  found: Map<MarkCorner, MarkDetection>,
  h0: Homography,
  position: NonNullable<QrDetection['position']>
): Prediction {
  const target = markCenter(corner)
  const known = [...found.entries()]
  if (known.length === 0) return { point: applyHomography(h0, target), windowFactor: MARK_WINDOW_FACTOR }

  // Refit with the QR corners plus every mark found so far. The marks pin
  // the page's extent; the QR corners carry what perspective there is.
  const pairs = [
    ...CORNERS.map((c) => ({ from: QR_SHEET_CORNERS[c], to: position[c] })),
    ...known.map(([c, m]) => ({ from: markCenter(c), to: m.center }))
  ]
  let point: Point
  try {
    point = applyHomography(solveHomography(pairs), target)
  } catch {
    point = applyHomography(h0, target)
  }
  if (known.length >= 3) {
    // Sanity-check against the affine through the three marks; average the two.
    const affine = applyAffine(fitAffine(known.map(([c, m]) => ({ from: markCenter(c), to: m.center }))), target)
    if (process.env.SCAN_DEBUG === '1') {
      console.log(`[marks] ${corner} homography=(${point.x.toFixed(0)},${point.y.toFixed(0)}) affine=(${affine.x.toFixed(0)},${affine.y.toFixed(0)})`)
    }
    const spread = Math.hypot(affine.x - point.x, affine.y - point.y)
    point = { x: (point.x + affine.x) / 2, y: (point.y + affine.y) / 2 }
    return { point, windowFactor: 4, extraHalf: spread / 2 }
  }
  if (known.length === 2) {
    const [[ca, ma], [cb, mb]] = known as [[MarkCorner, MarkDetection], [MarkCorner, MarkDetection]]
    const similar = applySimilarity(markCenter(ca), ma.center, markCenter(cb), mb.center, target)
    // Search around the homography's guess, but widen the window to cover the similarity's guess too.
    const spread = Math.hypot(similar.x - point.x, similar.y - point.y)
    return { point, windowFactor: 5, extraHalf: spread / 2 }
  }
  return { point, windowFactor: 4 }
}

/** Map `p` with the similarity (rotation, uniform scale, translation) that sends a1 -> b1 and a2 -> b2. */
function applySimilarity(a1: Point, b1: Point, a2: Point, b2: Point, p: Point): Point {
  const ax = a2.x - a1.x
  const ay = a2.y - a1.y
  const bx = b2.x - b1.x
  const by = b2.y - b1.y
  const denom = ax * ax + ay * ay
  if (denom < 1e-9) return b1
  // Complex ratio (bx + i by) / (ax + i ay).
  const re = (bx * ax + by * ay) / denom
  const im = (by * ax - bx * ay) / denom
  const dx = p.x - a1.x
  const dy = p.y - a1.y
  return { x: b1.x + re * dx - im * dy, y: b1.y + im * dx + re * dy }
}

type Affine = readonly [number, number, number, number, number, number]

/** Least-squares affine (x' = a x + b y + c, y' = d x + e y + f) from three or more pairs. */
function fitAffine(pairs: { from: Point; to: Point }[]): Affine {
  // Normal equations for the 3x3 system shared by both rows.
  let sxx = 0
  let sxy = 0
  let sx = 0
  let syy = 0
  let sy = 0
  let n = 0
  let tx = 0
  let txx = 0
  let txy = 0
  let ty = 0
  let tyx = 0
  let tyy = 0
  for (const { from, to } of pairs) {
    sxx += from.x * from.x
    sxy += from.x * from.y
    sx += from.x
    syy += from.y * from.y
    sy += from.y
    n += 1
    txx += from.x * to.x
    txy += from.y * to.x
    tx += to.x
    tyx += from.x * to.y
    tyy += from.y * to.y
    ty += to.y
  }
  const m: number[][] = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n]
  ]
  const [a, b, c] = solve3(m, [txx, txy, tx])
  const [d, e, f] = solve3(m, [tyx, tyy, ty])
  return [a, b, c, d, e, f]
}

function applyAffine(t: Affine, p: Point): Point {
  return { x: t[0] * p.x + t[1] * p.y + t[2], y: t[3] * p.x + t[4] * p.y + t[5] }
}

/** Cramer's rule for a 3x3 system; falls back to zeros when singular. */
function solve3(m: number[][], r: number[]): [number, number, number] {
  const det3 = (a: number[][]): number => {
    const [r0, r1, r2] = [a[0] ?? [], a[1] ?? [], a[2] ?? []]
    const g = (row: number[], i: number): number => row[i] ?? 0
    return (
      g(r0, 0) * (g(r1, 1) * g(r2, 2) - g(r1, 2) * g(r2, 1)) -
      g(r0, 1) * (g(r1, 0) * g(r2, 2) - g(r1, 2) * g(r2, 0)) +
      g(r0, 2) * (g(r1, 0) * g(r2, 1) - g(r1, 1) * g(r2, 0))
    )
  }
  const det = det3(m)
  if (Math.abs(det) < 1e-9) return [0, 0, 0]
  const replaced = (col: number): number[][] => m.map((row, i) => row.map((v, j) => (j === col ? (r[i] ?? 0) : v)))
  return [det3(replaced(0)) / det, det3(replaced(1)) / det, det3(replaced(2)) / det]
}

function findMarksFromCorners(img: GrayImage): MarkSearch {
  const portrait = img.height >= img.width
  const pxPerPt = (portrait ? img.width : img.height) / PAGE_WIDTH
  const inset = 35 * pxPerPt
  const imageCorners: Record<MarkCorner, Point> = {
    topLeft: { x: inset, y: inset },
    topRight: { x: img.width - inset, y: inset },
    bottomRight: { x: img.width - inset, y: img.height - inset },
    bottomLeft: { x: inset, y: img.height - inset }
  }
  const windowHalf = Math.max(img.width, img.height) * CORNER_WINDOW_FRACTION
  const found: Partial<Record<MarkCorner, MarkDetection>> = {}
  let sawCandidates = false
  for (const corner of CORNERS) {
    const r = refineMark(img, corner, imageCorners[corner], pxPerPt, windowHalf)
    if (r.candidates > 0) sawCandidates = true
    if (r.mark) found[corner] = r.mark
  }
  const located = CORNERS.filter((c) => found[c] !== undefined)
  if (located.length < 4) {
    return { marks: located.map((c) => found[c] as MarkDetection), method: located.length ? 'corners' : 'none', rotation: null, sawCandidates }
  }

  // The circle has the lowest fill ratio; it must be clearly separated from the squares.
  const sorted = [...CORNERS].sort((a, b) => (found[a] as MarkDetection).fillRatio - (found[b] as MarkDetection).fillRatio)
  const circleCorner = sorted[0] as MarkCorner
  const circle = found[circleCorner] as MarkDetection
  const nextRatio = (found[sorted[1] as MarkCorner] as MarkDetection).fillRatio
  if (circle.fillRatio >= MARK_CIRCLE_MAX_RATIO || nextRatio < MARK_CIRCLE_MAX_RATIO) {
    return { marks: CORNERS.map((c) => found[c] as MarkDetection), method: 'corners', rotation: null, sawCandidates }
  }
  // CORNERS is clockwise; rotating the image k quarter turns clockwise moves content at index i to i + k.
  const circleIndex = CORNERS.indexOf(circleCorner)
  const k = (CORNERS.indexOf('bottomRight') - circleIndex + 4) % 4
  const marks = CORNERS.map((sheetCorner, j) => {
    const imageCorner = CORNERS[(j - k + 4) % 4] as MarkCorner
    const m = found[imageCorner] as MarkDetection
    return { ...m, corner: sheetCorner }
  })
  return { marks, method: 'corners', rotation: k * 90, sawCandidates }
}

interface Refined {
  mark: MarkDetection | null
  candidates: number
}

/** Search a window around `predicted` for the dark blob that best matches a mark of the expected size. */
function refineMark(img: GrayImage, corner: MarkCorner, predicted: Point, pxPerPt: number, windowHalfOverride?: number): Refined {
  const markPx = REG_MARK_SIZE * pxPerPt
  const half = windowHalfOverride ?? Math.max(30, markPx * MARK_WINDOW_FACTOR)
  const rect: Rect = { x: predicted.x - half, y: predicted.y - half, width: half * 2, height: half * 2 }
  // A mark is a small fraction of the window, so "dark" must come from a
  // very low percentile; "light" is the paper. Everything well below the
  // paper counts as ink, capped halfway to the darkest pixels.
  const dark = percentile(img, rect, 0.2)
  const light = percentile(img, rect, 90)
  const debug = process.env.SCAN_DEBUG === '1'
  if (light - dark < MARK_MIN_CONTRAST) {
    if (debug) console.log(`[marks] ${corner} pred=(${predicted.x.toFixed(0)},${predicted.y.toFixed(0)}) half=${half.toFixed(0)} low contrast dark=${dark} light=${light}`)
    return { mark: null, candidates: 0 }
  }
  const threshold = Math.min(light - MARK_MIN_CONTRAST, (dark + light) / 2)
  const expectedArea = markPx * markPx
  const blobs = findDarkBlobs(img, rect, threshold, Math.max(4, Math.floor(expectedArea * 0.1)))
  if (debug) {
    console.log(`[marks] ${corner} pred=(${predicted.x.toFixed(0)},${predicted.y.toFixed(0)}) half=${half.toFixed(0)} thr=${threshold.toFixed(0)} expArea=${expectedArea.toFixed(0)} blobs=${blobs.length}`)
    for (const b of blobs.slice().sort((x, y) => y.areaPx - x.areaPx).slice(0, 6)) {
      const w = b.maxX - b.minX + 1
      const hgt = b.maxY - b.minY + 1
      console.log(`[marks]    area=${b.areaPx} ratio=${(b.areaPx / expectedArea).toFixed(2)} c=(${b.cx.toFixed(0)},${b.cy.toFixed(0)}) dist=${Math.hypot(b.cx - predicted.x, b.cy - predicted.y).toFixed(0)} bbox=${w}x${hgt} fill=${(b.areaPx / (w * hgt)).toFixed(2)}`)
    }
  }

  let best: Blob | null = null
  let bestScore = Infinity
  let candidates = 0
  for (const blob of blobs) {
    const w = blob.maxX - blob.minX + 1
    const hgt = blob.maxY - blob.minY + 1
    const aspect = Math.max(w / hgt, hgt / w)
    const areaRatio = blob.areaPx / expectedArea
    const fillRatio = blob.areaPx / (w * hgt)
    if (areaRatio < MARK_AREA_MIN || areaRatio > MARK_AREA_MAX || aspect > MARK_ASPECT_MAX || fillRatio < MARK_MIN_FILL_RATIO) continue
    candidates++
    const dist = Math.hypot(blob.cx - predicted.x, blob.cy - predicted.y)
    if (dist > half) continue
    // Distance dominates; area mismatch breaks ties.
    const score = dist + Math.abs(Math.log(areaRatio)) * markPx
    if (score < bestScore) {
      bestScore = score
      best = blob
    }
  }
  if (!best) return { mark: null, candidates }
  const bw = best.maxX - best.minX + 1
  const bh = best.maxY - best.minY + 1
  return {
    mark: { corner, center: { x: best.cx, y: best.cy }, fillRatio: best.areaPx / (bw * bh), areaPx: best.areaPx },
    candidates
  }
}

/** Clockwise rotation that makes the sheet's x axis point right in the image. */
export function rotationFromHomography(h: Homography): number {
  const o = applyHomography(h, { x: 0, y: 0 })
  const x = applyHomography(h, { x: PAGE_WIDTH, y: 0 })
  const angle = (Math.atan2(x.y - o.y, x.x - o.x) * 180) / Math.PI
  const quarter = ((Math.round(angle / 90) % 4) + 4) % 4
  return ((4 - quarter) % 4) * 90
}
