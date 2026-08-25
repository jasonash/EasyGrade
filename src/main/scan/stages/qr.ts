import jsQR from 'jsqr'
import { readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import { parseQrPayload } from '@shared/codes'
import type { Point, QrDetection } from '@shared/schemas'
import { crop, downscale, toRgba, upscale, type GrayImage, type Rect } from '../image'
import { ensureZxing } from '../zxing-module'

/**
 * Decode the sheet's QR. zxing on the full page finds nearly everything,
 * including upside-down pages and phone photos with the page in the middle
 * of the frame. The later strategies exist for the odd scan where the
 * symbol is too small or too large for the first pass: a half-scale pass,
 * then jsQR on the full page and on 2x corner windows. Only a well-formed
 * EasyGrade payload counts; any other QR is ignored.
 */

const ZXING_OPTIONS: ReaderOptions = {
  formats: ['QRCode'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 4
}

interface RawDecode {
  text: string
  position: QrDetection['position']
}

interface Strategy {
  name: string
  run: (img: GrayImage) => Promise<RawDecode[]>
}

const STRATEGIES: Strategy[] = [
  { name: 'zxing-full', run: (img) => zxing(img, 1, { x: 0, y: 0 }) },
  { name: 'zxing-half', run: (img) => zxing(downscale(img, 2), 2, { x: 0, y: 0 }) },
  { name: 'jsqr-full', run: async (img) => jsqr(img, 1, { x: 0, y: 0 }) },
  { name: 'jsqr-corners-2x', run: async (img) => cornerWindows(img).flatMap((r) => jsqr(upscale(crop(img, r), 2), 0.5, r)) }
]

export async function readQr(img: GrayImage): Promise<QrDetection | null> {
  for (const strategy of STRATEGIES) {
    let decodes: RawDecode[]
    try {
      decodes = await strategy.run(img)
    } catch {
      continue
    }
    for (const decode of decodes) {
      const payload = parseQrPayload(decode.text)
      if (payload) return { raw: decode.text.trim(), payload, position: decode.position, strategy: strategy.name }
    }
  }
  return null
}

async function zxing(img: GrayImage, scaleBack: number, offset: Point): Promise<RawDecode[]> {
  await ensureZxing()
  const results = await readBarcodes({ data: toRgba(img), width: img.width, height: img.height }, ZXING_OPTIONS)
  return results
    .filter((r) => r.isValid && r.text.length > 0)
    .map((r) => ({
      text: r.text,
      position: {
        topLeft: back(r.position.topLeft, scaleBack, offset),
        topRight: back(r.position.topRight, scaleBack, offset),
        bottomRight: back(r.position.bottomRight, scaleBack, offset),
        bottomLeft: back(r.position.bottomLeft, scaleBack, offset)
      }
    }))
}

function jsqr(img: GrayImage, scaleBack: number, offset: Point): RawDecode[] {
  const code = jsQR(toRgba(img), img.width, img.height, { inversionAttempts: 'dontInvert' })
  if (!code || !code.data) return []
  const loc = code.location
  return [
    {
      text: code.data,
      position: {
        topLeft: back(loc.topLeftCorner, scaleBack, offset),
        topRight: back(loc.topRightCorner, scaleBack, offset),
        bottomRight: back(loc.bottomRightCorner, scaleBack, offset),
        bottomLeft: back(loc.bottomLeftCorner, scaleBack, offset)
      }
    }
  ]
}

function back(p: Point, scaleBack: number, offset: Point): Point {
  return { x: p.x * scaleBack + offset.x, y: p.y * scaleBack + offset.y }
}

/** The four corner windows (40% of each side), top-right first since that is where the QR prints. */
function cornerWindows(img: GrayImage): Rect[] {
  const w = Math.round(img.width * 0.4)
  const h = Math.round(img.height * 0.4)
  return [
    { x: img.width - w, y: 0, width: w, height: h },
    { x: 0, y: img.height - h, width: w, height: h },
    { x: 0, y: 0, width: w, height: h },
    { x: img.width - w, y: img.height - h, width: w, height: h }
  ]
}
