import type { SheetLayout } from '@shared/layout'
import { REG_MARK_CENTERS } from '@shared/layout'
import type { DetectedRow, RowState } from '@shared/schemas'
import { discMean, median, type GrayImage } from '../image'
import {
  CANONICAL_SCALE,
  DISC_RADIUS_FACTOR,
  FULL_CONFIDENCE_FILL,
  INK_REF_HALF_SIZE,
  MIN_INK_SPAN,
  PAPER_STRIP_HALF_HEIGHT,
  PAPER_STRIP_X0,
  PAPER_STRIP_X1,
  T_BLANK,
  T_FILL,
  T_SECOND
} from '../thresholds'

/**
 * Optical mark reading on the canonical page. For every row: a local
 * paper-white reference from the blank margin beside the bubble strip, a
 * page-level ink reference from inside the top-left registration mark, and
 * the mean darkness of a disc inside each bubble, normalized between them.
 * Classification follows ARCHITECTURE 6.3 using the thresholds file.
 */

export interface PageReferences {
  ink: number
  /** Whether the page had enough contrast between ink and paper to grade. */
  usable: boolean
}

export function pageReferences(canonical: GrayImage): PageReferences {
  const [cx, cy] = REG_MARK_CENTERS.topLeft
  const half = INK_REF_HALF_SIZE * CANONICAL_SCALE
  const ink = median(canonical, { x: cx * CANONICAL_SCALE - half, y: cy * CANONICAL_SCALE - half, width: half * 2, height: half * 2 })
  const paper = median(canonical, {
    x: PAPER_STRIP_X0 * CANONICAL_SCALE,
    y: 200 * CANONICAL_SCALE,
    width: (PAPER_STRIP_X1 - PAPER_STRIP_X0) * CANONICAL_SCALE,
    height: 500 * CANONICAL_SCALE
  })
  return { ink, usable: paper - ink >= MIN_INK_SPAN }
}

/** Normalized darkness of every bubble, row by row: 0 = paper, 1 = ink. */
export function sampleFills(canonical: GrayImage, layout: SheetLayout, refs: PageReferences): number[][] {
  const radius = layout.bubbleRadius * CANONICAL_SCALE * DISC_RADIUS_FACTOR
  return layout.choiceCounts.map((count, q) => {
    const rowY = (layout.rowY[q] ?? 0) * CANONICAL_SCALE
    const paper = median(canonical, {
      x: PAPER_STRIP_X0 * CANONICAL_SCALE,
      y: rowY - PAPER_STRIP_HALF_HEIGHT * CANONICAL_SCALE,
      width: (PAPER_STRIP_X1 - PAPER_STRIP_X0) * CANONICAL_SCALE,
      height: PAPER_STRIP_HALF_HEIGHT * 2 * CANONICAL_SCALE
    })
    const span = Math.max(MIN_INK_SPAN, paper - refs.ink)
    const fills: number[] = []
    for (let c = 0; c < count; c++) {
      const bx = (layout.bubbleX[c] ?? 0) * CANONICAL_SCALE
      const mean = discMean(canonical, bx, rowY, radius)
      const darkness = (paper - mean) / span
      fills.push(Math.round(Math.min(1, Math.max(0, darkness)) * 1000) / 1000)
    }
    return fills
  })
}

export function classifyRow(q: number, fills: number[]): DetectedRow {
  const ranked = fills.map((fill, index) => ({ fill, index })).sort((a, b) => b.fill - a.fill)
  const first = ranked[0]
  const second = ranked[1]
  const d1 = first?.fill ?? 0
  const d2 = second?.fill ?? 0
  let state: RowState
  let choice: number | null = null
  let confidence: number
  if (d1 < T_BLANK) {
    state = 'blank'
    confidence = (T_BLANK - d1) / T_BLANK
  } else if (d1 >= T_FILL && d2 < T_SECOND) {
    state = 'filled'
    choice = first?.index ?? null
    confidence = Math.min((d1 - T_FILL) / (FULL_CONFIDENCE_FILL - T_FILL), (T_SECOND - d2) / T_SECOND)
  } else if (d1 >= T_FILL) {
    state = 'multiple'
    confidence = Math.min((d1 - T_FILL) / (FULL_CONFIDENCE_FILL - T_FILL), (d2 - T_SECOND) / (FULL_CONFIDENCE_FILL - T_SECOND))
  } else {
    state = 'ambiguous'
    confidence = 0
  }
  return { q, state, choice, fills, confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100 }
}

export function classifyRows(fillsByRow: number[][]): DetectedRow[] {
  return fillsByRow.map((fills, q) => classifyRow(q, fills))
}
