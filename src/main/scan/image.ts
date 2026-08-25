/**
 * Minimal 8-bit grayscale image type and the handful of operations the scan
 * pipeline needs. Pixels are row-major, one byte each, 0 = black, 255 = white.
 * Everything here is pure and synchronous.
 */

export interface GrayImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function createGray(width: number, height: number, fill = 255): GrayImage {
  const data = new Uint8ClampedArray(width * height)
  if (fill !== 0) data.fill(fill)
  return { width, height, data }
}

/** Pixel value with edge clamping. */
export function pixelAt(img: GrayImage, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= img.width ? img.width - 1 : x
  const cy = y < 0 ? 0 : y >= img.height ? img.height - 1 : y
  return img.data[cy * img.width + cx] ?? 255
}

/** Bilinear sample at fractional coordinates; outside the image reads as white. */
export function sampleBilinear(img: GrayImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x > img.width - 1 || y > img.height - 1) return 255
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, img.width - 1)
  const y1 = Math.min(y0 + 1, img.height - 1)
  const fx = x - x0
  const fy = y - y0
  const w = img.width
  const d = img.data
  const p00 = d[y0 * w + x0] ?? 255
  const p10 = d[y0 * w + x1] ?? 255
  const p01 = d[y1 * w + x0] ?? 255
  const p11 = d[y1 * w + x1] ?? 255
  const top = p00 + (p10 - p00) * fx
  const bottom = p01 + (p11 - p01) * fx
  return top + (bottom - top) * fy
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Clamp a rectangle to the image bounds; may come back empty. */
export function clampRect(img: GrayImage, rect: Rect): Rect {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height))
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }
}

export function crop(img: GrayImage, rect: Rect): GrayImage {
  const r = clampRect(img, rect)
  const out = createGray(r.width, r.height)
  for (let y = 0; y < r.height; y++) {
    const srcStart = (r.y + y) * img.width + r.x
    out.data.set(img.data.subarray(srcStart, srcStart + r.width), y * r.width)
  }
  return out
}

/** Box-filter downscale by an integer factor (used for thumbnails and coarse searches). */
export function downscale(img: GrayImage, factor: number): GrayImage {
  if (factor <= 1) return img
  const w = Math.max(1, Math.floor(img.width / factor))
  const h = Math.max(1, Math.floor(img.height / factor))
  const out = createGray(w, h)
  const area = factor * factor
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * img.width + x * factor
        for (let dx = 0; dx < factor; dx++) sum += img.data[row + dx] ?? 255
      }
      out.data[y * w + x] = Math.round(sum / area)
    }
  }
  return out
}

/** Resize to an exact width, keeping the aspect ratio, with bilinear sampling. */
export function resizeToWidth(img: GrayImage, width: number): GrayImage {
  if (width >= img.width) return img
  const ratio = img.width / width
  const height = Math.max(1, Math.round(img.height / ratio))
  // Box-average first when shrinking by a lot so thin lines survive.
  const pre = ratio >= 2 ? downscale(img, Math.floor(ratio)) : img
  const out = createGray(width, height)
  const sx = pre.width / width
  const sy = pre.height / height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out.data[y * width + x] = Math.round(sampleBilinear(pre, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5))
    }
  }
  return out
}

/** Nearest-neighbour upscale by an integer factor (helps QR decoders on small symbols). */
export function upscale(img: GrayImage, factor: number): GrayImage {
  if (factor <= 1) return img
  const w = img.width * factor
  const h = img.height * factor
  const out = createGray(w, h)
  for (let y = 0; y < h; y++) {
    const srcRow = Math.floor(y / factor) * img.width
    const dstRow = y * w
    for (let x = 0; x < w; x++) out.data[dstRow + x] = img.data[srcRow + Math.floor(x / factor)] ?? 255
  }
  return out
}

/** Rotate by a multiple of 90 degrees clockwise. */
export function rotate(img: GrayImage, degrees: 0 | 90 | 180 | 270): GrayImage {
  if (degrees === 0) return img
  const { width: w, height: h, data } = img
  if (degrees === 180) {
    const out = createGray(w, h)
    const n = w * h
    for (let i = 0; i < n; i++) out.data[n - 1 - i] = data[i] ?? 255
    return out
  }
  const out = createGray(h, w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x] ?? 255
      if (degrees === 90) out.data[x * h + (h - 1 - y)] = v
      else out.data[(w - 1 - x) * h + y] = v
    }
  }
  return out
}

/** Expand gray to RGBA (what both QR decoders want). */
export function toRgba(img: GrayImage): Uint8ClampedArray {
  const n = img.width * img.height
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = img.data[i] ?? 255
    out[j] = v
    out[j + 1] = v
    out[j + 2] = v
    out[j + 3] = 255
  }
  return out
}

/** Value at a percentile (0..100) of the pixels in a rectangle. */
export function percentile(img: GrayImage, rect: Rect, p: number): number {
  const r = clampRect(img, rect)
  if (r.width === 0 || r.height === 0) return 255
  const hist = new Uint32Array(256)
  for (let y = r.y; y < r.y + r.height; y++) {
    const row = y * img.width
    for (let x = r.x; x < r.x + r.width; x++) {
      const v = img.data[row + x] ?? 255
      hist[v] = (hist[v] ?? 0) + 1
    }
  }
  const total = r.width * r.height
  const target = Math.min(total - 1, Math.max(0, Math.floor((p / 100) * total)))
  let seen = 0
  for (let v = 0; v < 256; v++) {
    seen += hist[v] ?? 0
    if (seen > target) return v
  }
  return 255
}

export function median(img: GrayImage, rect: Rect): number {
  return percentile(img, rect, 50)
}

/** Mean of the pixels inside a disc. Returns 255 for an empty disc. */
export function discMean(img: GrayImage, cx: number, cy: number, radius: number): number {
  let sum = 0
  let count = 0
  const r2 = radius * radius
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(img.height - 1, Math.ceil(cy + radius))
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(img.width - 1, Math.ceil(cx + radius))
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy <= r2) {
        sum += img.data[y * img.width + x] ?? 255
        count++
      }
    }
  }
  return count === 0 ? 255 : sum / count
}

/** Fraction of pixels inside a disc darker than `threshold`. */
export function discDarkFraction(img: GrayImage, cx: number, cy: number, radius: number, threshold: number): number {
  let dark = 0
  let count = 0
  const r2 = radius * radius
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(img.height - 1, Math.ceil(cy + radius))
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(img.width - 1, Math.ceil(cx + radius))
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy <= r2) {
        if ((img.data[y * img.width + x] ?? 255) < threshold) dark++
        count++
      }
    }
  }
  return count === 0 ? 0 : dark / count
}

export interface Blob {
  areaPx: number
  /** Centroid in image pixels. */
  cx: number
  cy: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Connected components (4-neighbour) of pixels darker than `threshold`
 * inside a rectangle. Components smaller than `minArea` are dropped.
 * Iterative flood fill, so deep blobs cannot overflow the stack.
 */
export function findDarkBlobs(img: GrayImage, rect: Rect, threshold: number, minArea = 4): Blob[] {
  const r = clampRect(img, rect)
  if (r.width === 0 || r.height === 0) return []
  const visited = new Uint8Array(r.width * r.height)
  const blobs: Blob[] = []
  const stack: number[] = []
  for (let ly = 0; ly < r.height; ly++) {
    for (let lx = 0; lx < r.width; lx++) {
      const li = ly * r.width + lx
      if (visited[li]) continue
      visited[li] = 1
      if ((img.data[(r.y + ly) * img.width + (r.x + lx)] ?? 255) >= threshold) continue
      let area = 0
      let sumX = 0
      let sumY = 0
      let minX = lx
      let maxX = lx
      let minY = ly
      let maxY = ly
      stack.length = 0
      stack.push(li)
      while (stack.length > 0) {
        const cur = stack.pop() as number
        const cy = Math.floor(cur / r.width)
        const cx = cur - cy * r.width
        area++
        sumX += cx
        sumY += cy
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        const neighbours = [
          cx > 0 ? cur - 1 : -1,
          cx < r.width - 1 ? cur + 1 : -1,
          cy > 0 ? cur - r.width : -1,
          cy < r.height - 1 ? cur + r.width : -1
        ]
        for (const n of neighbours) {
          if (n < 0 || visited[n]) continue
          visited[n] = 1
          const ny = Math.floor(n / r.width)
          const nx = n - ny * r.width
          if ((img.data[(r.y + ny) * img.width + (r.x + nx)] ?? 255) < threshold) stack.push(n)
        }
      }
      if (area >= minArea) {
        blobs.push({
          areaPx: area,
          cx: r.x + sumX / area,
          cy: r.y + sumY / area,
          minX: r.x + minX,
          minY: r.y + minY,
          maxX: r.x + maxX,
          maxY: r.y + maxY
        })
      }
    }
  }
  return blobs
}
