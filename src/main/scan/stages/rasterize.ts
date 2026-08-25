import * as mupdf from 'mupdf'
import { extname } from 'node:path'
import { createGray, type GrayImage } from '../image'

/**
 * Turn a PDF or image file into one grayscale raster per page. mupdf opens
 * JPEG/PNG/TIFF as single-page documents, so every input goes through the
 * same path. Pages from scanners arrive in points (a letter page is about
 * 612 wide) and are rendered at roughly 200 DPI; phone photos arrive in
 * pixels and are capped so a 12-megapixel shot does not blow up memory.
 */

/** Target width of the short side for point-sized pages (letter at 200 DPI). */
export const RASTER_SHORT_SIDE = 1700
/** Largest short side kept for pixel-sized inputs (phone photos). */
export const RASTER_MAX_SHORT_SIDE = 2400

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif'
}

export const SUPPORTED_SCAN_EXTENSIONS = Object.keys(MIME_BY_EXT).map((e) => e.slice(1))

export function mimeForFile(fileName: string): string | null {
  return MIME_BY_EXT[extname(fileName).toLowerCase()] ?? null
}

export interface RasterPage {
  index: number
  image: GrayImage
  /** Source pixels per source unit (points for PDFs, pixels for images). */
  scale: number
  /** Page bounds in source units. */
  boundsWidth: number
  boundsHeight: number
}

export function rasterScale(boundsWidth: number, boundsHeight: number): number {
  const short = Math.max(1, Math.min(boundsWidth, boundsHeight))
  if (short <= RASTER_SHORT_SIDE) return RASTER_SHORT_SIDE / short
  return Math.min(1, RASTER_MAX_SHORT_SIDE / short)
}

export function countPages(buffer: Uint8Array, mime: string): number {
  const doc = mupdf.Document.openDocument(buffer, mime)
  try {
    return doc.countPages()
  } finally {
    doc.destroy()
  }
}

/** Render every page (or the pages in `indices`) of a document. */
export function rasterize(buffer: Uint8Array, mime: string, indices?: number[]): RasterPage[] {
  const doc = mupdf.Document.openDocument(buffer, mime)
  try {
    const count = doc.countPages()
    const wanted = indices ?? Array.from({ length: count }, (_, i) => i)
    return wanted.filter((i) => i >= 0 && i < count).map((i) => rasterPage(doc, i))
  } finally {
    doc.destroy()
  }
}

function rasterPage(doc: mupdf.Document, index: number): RasterPage {
  const page = doc.loadPage(index)
  try {
    const [x0, y0, x1, y1] = page.getBounds()
    const boundsWidth = x1 - x0
    const boundsHeight = y1 - y0
    const scale = rasterScale(boundsWidth, boundsHeight)
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false, true)
    try {
      const width = pixmap.getWidth()
      const height = pixmap.getHeight()
      const stride = pixmap.getStride()
      const pixels = pixmap.getPixels()
      const image = createGray(width, height)
      if (stride === width) {
        image.data.set(pixels.subarray(0, width * height))
      } else {
        for (let y = 0; y < height; y++) image.data.set(pixels.subarray(y * stride, y * stride + width), y * width)
      }
      return { index, image, scale, boundsWidth, boundsHeight }
    } finally {
      pixmap.destroy()
    }
  } finally {
    page.destroy()
  }
}
