/**
 * Every tunable number in the scan pipeline lives here (ARCHITECTURE 6.3:
 * "thresholds are constants in one file and are tuned against the fixture
 * set; they are never hard-coded elsewhere").
 */

/** Canonical page: 2 pixels per PDF point, letter size. */
export const CANONICAL_SCALE = 2
export const CANONICAL_WIDTH = 612 * CANONICAL_SCALE
export const CANONICAL_HEIGHT = 792 * CANONICAL_SCALE

/** Mark search window half-size, as a multiple of the printed mark size. */
export const MARK_WINDOW_FACTOR = 3
/** Accept a blob as a mark when its area is within this range of the expected area. */
export const MARK_AREA_MIN = 0.35
export const MARK_AREA_MAX = 2.5
/** Blob bounding box aspect ratio must be within this of square. */
export const MARK_ASPECT_MAX = 1.6
/** Minimum contrast (p98 - p2) inside a search window before we trust a threshold. */
export const MARK_MIN_CONTRAST = 40
/** Blob area over bounding box area below which a blob is too hollow or thin to be a mark (QR finder patterns, lines). */
export const MARK_MIN_FILL_RATIO = 0.6
/** Blob area over bounding box area below which a mark is a circle rather than a square. */
export const MARK_CIRCLE_MAX_RATIO = 0.88
/** Corner search windows when no QR anchors the page, as a fraction of each side. */
export const CORNER_WINDOW_FRACTION = 0.15

/** QR corner reprojection error (canonical px) above which alignment is "weak". */
export const WEAK_RESIDUAL_PX = 6

/** Bubble sampling disc radius as a fraction of the printed bubble radius. */
export const DISC_RADIUS_FACTOR = 0.7
/** Paper-white reference strip beside each row, in PDF points. */
export const PAPER_STRIP_X0 = 589
export const PAPER_STRIP_X1 = 605
export const PAPER_STRIP_HALF_HEIGHT = 5
/** Ink reference: inner part of the top-left registration mark (half-size in points). */
export const INK_REF_HALF_SIZE = 5
/** Never let the paper/ink span collapse; below this the page is treated as low contrast. */
export const MIN_INK_SPAN = 40

/**
 * Row classification thresholds on normalized darkness (0 paper, 1 printed
 * ink). Tuned on the 2026-08-25 fixture set: blank bubbles read 0.00 on
 * every device, pencil fills 0.32-0.96, pen 0.80-1.00, erasure residue up
 * to 0.18, a faint stroke up to 0.17, a check mark up to 0.20, and a half
 * filled bubble 0.27-0.52.
 */
export const T_BLANK = 0.15
export const T_FILL = 0.28
export const T_SECOND = 0.22
/** Darkness at or above which a filled bubble earns full confidence (pencil rarely exceeds 0.6). */
export const FULL_CONFIDENCE_FILL = 0.6

/** Rows with confidence below this get a crop even when classified filled. */
export const LOW_CONFIDENCE = 0.5

/** Thumbnail width in pixels. */
export const THUMBNAIL_WIDTH = 300
