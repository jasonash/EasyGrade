import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  bounds: Rect | null
  maximized: boolean
}

export interface WindowDefaults {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

/** Bounds to open with: `x`/`y` omitted means "let the OS center it". */
export type OpenBounds = Partial<Pick<Rect, 'x' | 'y'>> & Pick<Rect, 'width' | 'height'>

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function contains(area: Rect, px: number, py: number): boolean {
  return px >= area.x && px < area.x + area.width && py >= area.y && py < area.y + area.height
}

/**
 * Fit the remembered bounds onto the displays that exist now. The window
 * goes back to the display its center was on, shrunk to that display's
 * work area if the display got smaller, and pulled fully on screen. When
 * no display contains that point (a monitor was unplugged) it is centered
 * on the first work area, which callers pass as the primary display.
 */
export function fitToDisplays(saved: Rect | null, workAreas: Rect[], defaults: WindowDefaults): OpenBounds {
  const primary = workAreas[0]
  if (!saved || !primary) return { width: defaults.width, height: defaults.height }

  const centerX = saved.x + saved.width / 2
  const centerY = saved.y + saved.height / 2
  const home = workAreas.find((area) => contains(area, centerX, centerY))
  const area = home ?? primary

  const width = clamp(saved.width, Math.min(defaults.minWidth, area.width), area.width)
  const height = clamp(saved.height, Math.min(defaults.minHeight, area.height), area.height)

  if (!home) {
    return {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height
    }
  }
  return {
    x: clamp(saved.x, area.x, area.x + area.width - width),
    y: clamp(saved.y, area.y, area.y + area.height - height),
    width,
    height
  }
}

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))
}

/** A JSON file next to the database; a missing or garbled file simply means "use the defaults". */
export class WindowStateFile {
  constructor(private readonly path: string) {}

  read(): WindowState {
    try {
      if (!existsSync(this.path)) return { bounds: null, maximized: false }
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null) return { bounds: null, maximized: false }
      const state = parsed as Record<string, unknown>
      return {
        bounds: isRect(state['bounds']) ? state['bounds'] : null,
        maximized: state['maximized'] === true
      }
    } catch {
      return { bounds: null, maximized: false }
    }
  }

  write(state: WindowState): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(this.path, JSON.stringify(state, null, 2))
    } catch {
      // Losing the window size is not worth interrupting a quit for.
    }
  }
}
