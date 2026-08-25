import type { SheetLayout } from '@shared/layout'
import { GRID_RIGHT, TEXT_COL_X } from '@shared/layout'
import type { DetectedRow } from '@shared/schemas'
import { crop, resizeToWidth, type GrayImage } from '../image'
import { CANONICAL_SCALE, LOW_CONFIDENCE, THUMBNAIL_WIDTH } from '../thresholds'

/**
 * Image crops the review UI shows: one per flagged row, the name and
 * section boxes for blank sheets, and a thumbnail of every page.
 */

export interface PageCrops {
  thumbnail: GrayImage
  crops: Record<string, GrayImage>
}

export function makeThumbnail(img: GrayImage): GrayImage {
  return resizeToWidth(img, THUMBNAIL_WIDTH)
}

export function rowCrop(canonical: GrayImage, layout: SheetLayout, q: number): GrayImage {
  const top = (layout.slotTop[q] ?? 0) * CANONICAL_SCALE
  const height = layout.slotHeight * CANONICAL_SCALE
  const x = (TEXT_COL_X - 4) * CANONICAL_SCALE
  const width = (GRID_RIGHT - TEXT_COL_X + 8) * CANONICAL_SCALE
  return crop(canonical, { x, y: top, width, height })
}

export function boxCrop(canonical: GrayImage, box: readonly [number, number, number, number]): GrayImage {
  const [x1, y1, x2, y2] = box
  const margin = 4 * CANONICAL_SCALE
  return crop(canonical, {
    x: x1 * CANONICAL_SCALE - margin,
    y: y1 * CANONICAL_SCALE - margin,
    width: (x2 - x1) * CANONICAL_SCALE + margin * 2,
    height: (y2 - y1) * CANONICAL_SCALE + margin * 2
  })
}

export function needsCrop(row: DetectedRow): boolean {
  return row.state !== 'filled' || row.confidence < LOW_CONFIDENCE
}

export function makeCrops(
  canonical: GrayImage | null,
  layout: SheetLayout | null,
  answers: DetectedRow[] | null,
  blankSheet: boolean
): Record<string, GrayImage> {
  const crops: Record<string, GrayImage> = {}
  if (!canonical || !layout) return crops
  if (answers) {
    for (const row of answers) {
      if (needsCrop(row)) crops[`row_${row.q}`] = rowCrop(canonical, layout, row.q)
    }
  }
  if (blankSheet) {
    crops.name_box = boxCrop(canonical, layout.nameBox)
    crops.section_box = boxCrop(canonical, layout.sectionBox)
  }
  return crops
}
