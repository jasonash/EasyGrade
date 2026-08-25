import type { AlignmentInfo, MarkDetection, QrDetection } from '@shared/schemas'
import { applyHomography, solveHomography, type Homography } from '../homography'
import { warpToCanonical } from '../homography'
import type { GrayImage } from '../image'
import { CANONICAL_HEIGHT, CANONICAL_SCALE, CANONICAL_WIDTH, WEAK_RESIDUAL_PX } from '../thresholds'
import { CORNERS, QR_SHEET_CORNERS, markCenter } from './marks'

/**
 * Fit the sheet-to-image homography from the four mark centroids and warp
 * the page to the canonical 1224 x 1584 raster. With exactly four marks the
 * fit is exact, so the QR corners (found independently) serve as the
 * residual check: if they land far from where the marks say they should,
 * the page is bent or the marks are wrong, and the alignment is "weak".
 */

export interface Alignment {
  info: AlignmentInfo
  homography: Homography | null
  canonical: GrayImage | null
}

export function alignPage(img: GrayImage, marks: MarkDetection[], method: AlignmentInfo['method'], qr: QrDetection | null): Alignment {
  const byCorner = new Map(marks.map((m) => [m.corner, m]))
  if (marks.length < 4 || CORNERS.some((c) => !byCorner.has(c))) {
    return { info: { quality: 'failed', residual: null, marks, method }, homography: null, canonical: null }
  }
  let homography: Homography
  try {
    homography = solveHomography(
      CORNERS.map((c) => ({ from: markCenter(c), to: (byCorner.get(c) as MarkDetection).center }))
    )
  } catch {
    return { info: { quality: 'failed', residual: null, marks, method }, homography: null, canonical: null }
  }

  let residual: number | null = null
  if (qr?.position) {
    const pxPerPt = Math.hypot(qr.position.topRight.x - qr.position.topLeft.x, qr.position.topRight.y - qr.position.topLeft.y) / 90
    let worst = 0
    for (const c of CORNERS) {
      const predicted = applyHomography(homography, QR_SHEET_CORNERS[c])
      const actual = qr.position[c]
      worst = Math.max(worst, Math.hypot(predicted.x - actual.x, predicted.y - actual.y))
    }
    // Convert source pixels to canonical pixels.
    residual = pxPerPt > 0 ? (worst / pxPerPt) * CANONICAL_SCALE : null
    if (residual !== null) residual = Math.round(residual * 10) / 10
  }
  const quality: AlignmentInfo['quality'] = residual !== null && residual > WEAK_RESIDUAL_PX ? 'weak' : 'good'
  const canonical = warpToCanonical(img, homography, CANONICAL_WIDTH, CANONICAL_HEIGHT, CANONICAL_SCALE)
  return { info: { quality, residual, marks, method }, homography, canonical }
}
