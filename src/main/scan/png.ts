import { PNG } from 'pngjs'
import { createGray, type GrayImage } from './image'

/** Encode a grayscale image as an 8-bit PNG (colour type 0, no alpha). */
export function encodePng(img: GrayImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height, colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 })
}

/** Decode a PNG to grayscale (luma of RGB; alpha composited over white). */
export function decodePng(buffer: Buffer): GrayImage {
  const png = PNG.sync.read(buffer)
  const out = createGray(png.width, png.height)
  const n = png.width * png.height
  for (let i = 0; i < n; i++) {
    const r = png.data[i * 4] ?? 255
    const g = png.data[i * 4 + 1] ?? 255
    const b = png.data[i * 4 + 2] ?? 255
    const a = (png.data[i * 4 + 3] ?? 255) / 255
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    out.data[i] = Math.round(luma * a + 255 * (1 - a))
  }
  return out
}
