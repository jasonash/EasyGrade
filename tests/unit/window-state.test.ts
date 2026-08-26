import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fitToDisplays, WindowStateFile, type Rect } from '../../src/main/window-state'

const defaults = { width: 1280, height: 820, minWidth: 1024, minHeight: 700 }
const laptop: Rect = { x: 0, y: 25, width: 1512, height: 920 }
const external: Rect = { x: 1512, y: 0, width: 2560, height: 1415 }

describe('fitToDisplays', () => {
  it('uses the defaults and lets the OS center when nothing was saved', () => {
    expect(fitToDisplays(null, [laptop], defaults)).toEqual({ width: 1280, height: 820 })
  })

  it('restores bounds that still fit on the display they were on', () => {
    const saved = { x: 1600, y: 100, width: 1800, height: 1100 }
    expect(fitToDisplays(saved, [laptop, external], defaults)).toEqual(saved)
  })

  it('shrinks a window that is larger than its display and keeps it on screen', () => {
    const saved = { x: 100, y: 100, width: 1800, height: 1100 }
    expect(fitToDisplays(saved, [laptop], defaults)).toEqual({ x: 0, y: 25, width: 1512, height: 920 })
  })

  it('pulls a window that hangs off an edge back inside the work area', () => {
    const saved = { x: 900, y: 500, width: 1200, height: 800 }
    expect(fitToDisplays(saved, [laptop], defaults)).toEqual({ x: 312, y: 145, width: 1200, height: 800 })
  })

  it('centers on the primary display when the saved display is gone', () => {
    const saved = { x: 1600, y: 100, width: 1800, height: 1100 }
    expect(fitToDisplays(saved, [laptop], defaults)).toEqual({ x: 0, y: 25, width: 1512, height: 920 })
    const small = { x: 2000, y: 200, width: 1100, height: 750 }
    expect(fitToDisplays(small, [laptop], defaults)).toEqual({ x: 206, y: 110, width: 1100, height: 750 })
  })

  it('never goes below the minimum size unless the display itself is smaller', () => {
    const saved = { x: 0, y: 25, width: 600, height: 400 }
    expect(fitToDisplays(saved, [laptop], defaults)).toMatchObject({ width: 1024, height: 700 })
    const tiny: Rect = { x: 0, y: 0, width: 800, height: 600 }
    expect(fitToDisplays(saved, [tiny], defaults)).toMatchObject({ width: 800, height: 600 })
  })
})

describe('WindowStateFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'easygrade-window-'))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('round-trips state and tolerates a missing or garbled file', () => {
    const file = new WindowStateFile(join(dir, 'nested', 'window-state.json'))
    expect(file.read()).toEqual({ bounds: null, maximized: false })
    file.write({ bounds: { x: 1, y: 2, width: 1300, height: 900 }, maximized: true })
    expect(file.read()).toEqual({ bounds: { x: 1, y: 2, width: 1300, height: 900 }, maximized: true })
    writeFileSync(join(dir, 'nested', 'window-state.json'), '{"bounds": {"x": "no"}, "maximized": "yes"')
    expect(file.read()).toEqual({ bounds: null, maximized: false })
    writeFileSync(join(dir, 'nested', 'window-state.json'), '{"bounds": {"x": 1, "y": 2, "width": 3}, "maximized": true}')
    expect(file.read()).toEqual({ bounds: null, maximized: true })
  })
})
