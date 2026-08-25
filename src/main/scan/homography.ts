import type { Point } from '@shared/schemas'
import { createGray, sampleBilinear, type GrayImage } from './image'

/**
 * Planar homography (3x3, row-major, h[8] normalized to 1) mapping sheet
 * coordinates to source-image pixels, plus the inverse warp that produces
 * the canonical page. Pure TypeScript: for four to eight correspondences a
 * normalized DLT solved with Gaussian elimination is plenty, and it keeps
 * opencv out of the bundle.
 */
export type Homography = readonly [number, number, number, number, number, number, number, number, number]

export interface Correspondence {
  from: Point
  to: Point
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8]
  const safe = Math.abs(w) < 1e-12 ? 1e-12 : w
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / safe,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / safe
  }
}

/**
 * Least-squares homography from at least four correspondences (DLT with
 * Hartley normalization). Throws when the points are degenerate.
 */
export function solveHomography(pairs: Correspondence[]): Homography {
  if (pairs.length < 4) throw new RangeError('A homography needs at least four correspondences')
  const fromNorm = normalization(pairs.map((p) => p.from))
  const toNorm = normalization(pairs.map((p) => p.to))

  // Build the 2n x 8 system A h = b with h[8] = 1.
  const rows: number[][] = []
  const rhs: number[] = []
  for (const pair of pairs) {
    const s = fromNorm.apply(pair.from)
    const d = toNorm.apply(pair.to)
    rows.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y])
    rhs.push(d.x)
    rows.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y])
    rhs.push(d.y)
  }
  const h = solveLeastSquares(rows, rhs)
  const normalized: number[] = [...h, 1]
  // H = Tto^-1 * Hn * Tfrom
  const result = multiply(multiply(toNorm.inverse, normalized), fromNorm.matrix)
  const scale = result[8] ?? 1
  if (Math.abs(scale) < 1e-12) throw new RangeError('Degenerate homography')
  const out = result.map((v) => v / scale)
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0, out[3] ?? 0, out[4] ?? 0, out[5] ?? 0, out[6] ?? 0, out[7] ?? 0, 1]
}

/** Largest distance between each mapped `from` point and its `to` point. */
export function maxReprojectionError(h: Homography, pairs: Correspondence[]): number {
  let worst = 0
  for (const pair of pairs) {
    const p = applyHomography(h, pair.from)
    const d = Math.hypot(p.x - pair.to.x, p.y - pair.to.y)
    if (d > worst) worst = d
  }
  return worst
}

/**
 * Produce a canonical image: output pixel (x, y) is sampled from the source
 * at H(x / scale, y / scale), where `scale` is canonical pixels per sheet unit.
 */
export function warpToCanonical(src: GrayImage, h: Homography, width: number, height: number, scale: number): GrayImage {
  const out = createGray(width, height)
  const [a, b, c, d, e, f, g, hh, i] = h
  for (let y = 0; y < height; y++) {
    const sy = y / scale
    const row = y * width
    for (let x = 0; x < width; x++) {
      const sx = x / scale
      const w = g * sx + hh * sy + i
      const px = (a * sx + b * sy + c) / w
      const py = (d * sx + e * sy + f) / w
      out.data[row + x] = Math.round(sampleBilinear(src, px, py))
    }
  }
  return out
}

interface Normalization {
  matrix: number[]
  inverse: number[]
  apply: (p: Point) => Point
}

/** Translate to the centroid and scale so the mean distance from it is sqrt(2). */
function normalization(points: Point[]): Normalization {
  const n = points.length
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  cx /= n
  cy /= n
  let meanDist = 0
  for (const p of points) meanDist += Math.hypot(p.x - cx, p.y - cy)
  meanDist /= n
  const s = meanDist > 1e-9 ? Math.SQRT2 / meanDist : 1
  const matrix = [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]
  const inverse = [1 / s, 0, cx, 0, 1 / s, cy, 0, 0, 1]
  return { matrix, inverse, apply: (p) => ({ x: s * (p.x - cx), y: s * (p.y - cy) }) }
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(9).fill(0)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let k = 0; k < 3; k++) sum += (a[r * 3 + k] ?? 0) * (b[k * 3 + c] ?? 0)
      out[r * 3 + c] = sum
    }
  }
  return out
}

/** Solve min ||A x - b|| via the normal equations with partial pivoting. */
function solveLeastSquares(rows: number[][], rhs: number[]): number[] {
  const n = 8
  const ata: number[][] = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0))
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []
    const b = rhs[r] ?? 0
    for (let i = 0; i < n; i++) {
      const ri = row[i] ?? 0
      if (ri === 0) continue
      const target = ata[i] as number[]
      for (let j = 0; j < n; j++) target[j] = (target[j] ?? 0) + ri * (row[j] ?? 0)
      target[n] = (target[n] ?? 0) + ri * b
    }
  }
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(ata[r]?.[col] ?? 0) > Math.abs(ata[pivot]?.[col] ?? 0)) pivot = r
    }
    const pivotRow = ata[pivot] as number[]
    const colRow = ata[col] as number[]
    if (pivot !== col) {
      ata[pivot] = colRow
      ata[col] = pivotRow
    }
    const head = ata[col] as number[]
    const p = head[col] ?? 0
    if (Math.abs(p) < 1e-12) throw new RangeError('Degenerate homography')
    for (let r = col + 1; r < n; r++) {
      const target = ata[r] as number[]
      const factor = (target[col] ?? 0) / p
      if (factor === 0) continue
      for (let j = col; j <= n; j++) target[j] = (target[j] ?? 0) - factor * (head[j] ?? 0)
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    const row = ata[r] as number[]
    let sum = row[n] ?? 0
    for (let j = r + 1; j < n; j++) sum -= (row[j] ?? 0) * (x[j] ?? 0)
    x[r] = sum / (row[r] ?? 1)
  }
  return x
}
