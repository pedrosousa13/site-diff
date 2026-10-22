import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { cropPair, findDiffRegions, formatReport } from './aiReport'
import { DIFF_COLOR_ADDED, DIFF_COLOR_REMOVED } from './differ'
import { DEFAULT_CONFIG } from './types'
import type { ComparisonRun } from './types'

function blank(width: number, height: number) {
  const png = new PNG({ width, height })
  png.data.fill(200)
  return png
}

function paint(
  png: PNG,
  [x0, y0, x1, y1]: [number, number, number, number],
  color: [number, number, number],
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * png.width + x) * 4
      png.data[i] = color[0]
      png.data[i + 1] = color[1]
      png.data[i + 2] = color[2]
      png.data[i + 3] = 255
    }
  }
}

describe('findDiffRegions', () => {
  it('returns no regions for a diff without changed pixels', () => {
    expect(findDiffRegions(blank(50, 50))).toEqual([])
  })

  it('merges nearby bands and keeps far ones apart', () => {
    const diff = blank(100, 400)
    paint(diff, [10, 10, 30, 20], DIFF_COLOR_REMOVED)
    paint(diff, [40, 40, 60, 50], DIFF_COLOR_ADDED) // 20 rows below: merges
    paint(diff, [5, 300, 90, 310], DIFF_COLOR_REMOVED) // far below: new region

    const regions = findDiffRegions(diff, { minPixels: 1 })

    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({
      top: 10,
      bottom: 50,
      left: 10,
      right: 60,
    })
    expect(regions[1]).toMatchObject({
      top: 300,
      bottom: 310,
      left: 5,
      right: 90,
    })
  })

  it('drops small regions and keeps the largest ones in page order', () => {
    const diff = blank(100, 600)
    paint(diff, [0, 0, 1, 1], DIFF_COLOR_REMOVED) // 4 px: noise
    paint(diff, [0, 100, 99, 120], DIFF_COLOR_REMOVED) // large
    paint(diff, [0, 300, 9, 305], DIFF_COLOR_REMOVED) // small
    paint(diff, [0, 500, 99, 540], DIFF_COLOR_REMOVED) // largest

    const regions = findDiffRegions(diff, { minPixels: 10, maxRegions: 2 })

    expect(regions.map((r) => r.top)).toEqual([100, 500])
  })
})

describe('cropPair', () => {
  it('places A and B side by side with a gutter', () => {
    const a = blank(200, 200)
    const b = blank(200, 300)
    const out = cropPair(
      a,
      b,
      { top: 50, bottom: 99, left: 50, right: 99, pixels: 1 },
      { pad: 0, gutter: 8 },
    )
    expect(out.width).toBe(50 + 8 + 50)
    expect(out.height).toBe(50)
  })

  it('scales wide crops down to maxWidth', () => {
    const a = blank(1000, 100)
    const out = cropPair(
      a,
      a,
      { top: 0, bottom: 99, left: 0, right: 999, pixels: 1 },
      { pad: 0, gutter: 0, maxWidth: 500 },
    )
    expect(out.width).toBe(500)
    expect(out.height).toBe(25)
  })
})

describe('formatReport', () => {
  it('lists counts, errors and diffs worst first', () => {
    const run: ComparisonRun = {
      id: 'r1',
      baseUrlA: 'https://a.test',
      baseUrlB: 'https://b.test',
      createdAt: '2026-01-01T00:00:00Z',
      config: DEFAULT_CONFIG,
      slugs: ['/', '/x/', '/y/'],
      status: 'completed',
      results: [
        {
          slug: '/',
          mismatchPixels: 0,
          mismatchPercent: 0,
          status: 'match',
          sizeDiff: false,
          version: 1,
        },
        {
          slug: '/x/',
          mismatchPixels: 9,
          mismatchPercent: 3.5,
          status: 'diff',
          sizeDiff: true,
          version: 1,
        },
        {
          slug: '/y/',
          mismatchPixels: 0,
          mismatchPercent: 0,
          status: 'error',
          sizeDiff: false,
          version: 1,
          statusCodeB: 500,
          error: 'B failed: boom\nCall log:\n\u001b[2m  - navigating\u001b[22m',
        },
      ],
    }

    const text = formatReport(
      run,
      [
        {
          result: run.results[1],
          heightA: 1000,
          heightB: 1200,
          regions: [{ top: 10, bottom: 90, left: 0, right: 5, pixels: 9 }],
          cropPaths: ['/tmp/report/x-r1.png', '/tmp/report/x-r2.png'],
        },
      ],
      '/tmp/report',
    )

    expect(text).toContain('3/3 pages: 1 match, 1 diff, 1 error')
    expect(text).toContain('/y/ A=- B=500 B failed: boom\n')
    expect(text).not.toContain('Call log')
    expect(text).toContain('3.50% /x/ height A=1000 B=1200 regions 10-90')
    expect(text).toContain('crops (A left | B right) in /tmp/report')
    expect(text).toContain('    x-r1.png x-r2.png')
  })
})
