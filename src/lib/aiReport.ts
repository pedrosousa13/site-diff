import { PNG } from 'pngjs'
import { DIFF_COLOR_ADDED, DIFF_COLOR_REMOVED } from './differ'
import type { ComparisonRun, PageResult } from './types'

/** A horizontal band of a page where the diff image has changed pixels. */
export interface DiffRegion {
  top: number
  bottom: number
  left: number
  right: number
  pixels: number
}

export interface RegionOptions {
  /** Bands closer than this many rows merge into one region. */
  mergeGap?: number
  /** Regions with fewer changed pixels are noise (anti-aliasing, cursors). */
  minPixels?: number
  /** Keep only the largest regions, so a reader gets a few crops per page. */
  maxRegions?: number
}

const isDiffPixel = (data: Buffer, i: number) =>
  (data[i] === DIFF_COLOR_REMOVED[0] &&
    data[i + 1] === DIFF_COLOR_REMOVED[1] &&
    data[i + 2] === DIFF_COLOR_REMOVED[2]) ||
  (data[i] === DIFF_COLOR_ADDED[0] &&
    data[i + 1] === DIFF_COLOR_ADDED[1] &&
    data[i + 2] === DIFF_COLOR_ADDED[2])

/**
 * Groups the changed pixels of a pixelmatch diff image into horizontal bands,
 * largest first by changed-pixel count, then returned in page order.
 */
export function findDiffRegions(
  diff: PNG,
  { mergeGap = 40, minPixels = 50, maxRegions = 5 }: RegionOptions = {},
): DiffRegion[] {
  const { width, height, data } = diff
  const regions: DiffRegion[] = []
  let current: DiffRegion | null = null
  let lastDiffRow = -Infinity

  for (let y = 0; y < height; y++) {
    let rowPixels = 0
    let rowLeft = width
    let rowRight = -1
    for (let x = 0; x < width; x++) {
      if (isDiffPixel(data, (y * width + x) * 4)) {
        rowPixels++
        if (x < rowLeft) rowLeft = x
        if (x > rowRight) rowRight = x
      }
    }
    if (!rowPixels) continue

    if (current && y - lastDiffRow <= mergeGap) {
      current.bottom = y
      current.left = Math.min(current.left, rowLeft)
      current.right = Math.max(current.right, rowRight)
      current.pixels += rowPixels
    } else {
      current = {
        top: y,
        bottom: y,
        left: rowLeft,
        right: rowRight,
        pixels: rowPixels,
      }
      regions.push(current)
    }
    lastDiffRow = y
  }

  return regions
    .filter((r) => r.pixels >= minPixels)
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, maxRegions)
    .sort((a, b) => a.top - b.top)
}

function crop(img: PNG, r: DiffRegion, pad: number) {
  const left = Math.max(0, r.left - pad)
  const top = Math.max(0, r.top - pad)
  const right = Math.min(img.width - 1, r.right + pad)
  const bottom = Math.min(img.height - 1, r.bottom + pad)
  const out = new PNG({
    width: Math.max(1, right - left + 1),
    height: Math.max(1, bottom - top + 1),
    fill: true,
  })
  out.data.fill(255)
  if (left <= right && top <= bottom) {
    PNG.bitblt(img, out, left, top, out.width, out.height, 0, 0)
  }
  return out
}

function scaleDown(img: PNG, maxWidth: number): PNG {
  if (img.width <= maxWidth) return img
  const ratio = maxWidth / img.width
  const out = new PNG({
    width: maxWidth,
    height: Math.max(1, Math.round(img.height * ratio)),
  })
  for (let y = 0; y < out.height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / ratio))
    for (let x = 0; x < out.width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / ratio))
      img.data.copy(
        out.data,
        (y * out.width + x) * 4,
        (sy * img.width + sx) * 4,
        (sy * img.width + sx) * 4 + 4,
      )
    }
  }
  return out
}

/**
 * Crops the same region from A and B and places them side by side (A left,
 * B right, grey gutter between), scaled down to `maxWidth`. One small image per
 * region costs far fewer tokens than reading two full-page screenshots.
 */
export function cropPair(
  a: PNG,
  b: PNG,
  region: DiffRegion,
  { pad = 24, gutter = 8, maxWidth = 1200 } = {},
): PNG {
  const ca = crop(a, region, pad)
  const cb = crop(b, region, pad)
  const out = new PNG({
    width: ca.width + gutter + cb.width,
    height: Math.max(ca.height, cb.height),
  })
  out.data.fill(255)
  for (let y = 0; y < out.height; y++) {
    for (let x = ca.width; x < ca.width + gutter; x++) {
      const i = (y * out.width + x) * 4
      out.data[i] = out.data[i + 1] = out.data[i + 2] = 160
    }
  }
  PNG.bitblt(ca, out, 0, 0, ca.width, ca.height, 0, 0)
  PNG.bitblt(cb, out, 0, 0, cb.width, cb.height, ca.width + gutter, 0)
  return scaleDown(out, maxWidth)
}

export interface ReportPage {
  result: PageResult
  heightA?: number
  heightB?: number
  regions: DiffRegion[]
  cropPaths: string[]
}

const pct = (n: number) => `${n.toFixed(2)}%`

// Playwright errors carry a multi-line call log with ANSI colour codes; the
// first line says what failed, the rest only costs tokens.
const firstLine = (s: string) =>
  // eslint-disable-next-line no-control-regex
  s
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')[0]
    .trim()

/**
 * Plain-text summary: one line per page, worst first. Built for an AI reader.
 * `cropDir`, when given, is printed once and crop paths are listed relative to it.
 */
export function formatReport(
  run: ComparisonRun,
  pages: ReportPage[],
  cropDir?: string,
): string {
  const counts = { match: 0, diff: 0, error: 0 }
  for (const r of run.results) counts[r.status]++
  const lines = [
    `run ${run.id} (${run.status})`,
    `A=${run.baseUrlA} B=${run.baseUrlB}`,
    `${run.results.length}/${run.slugs.length} pages: ${counts.match} match, ${counts.diff} diff, ${counts.error} error`,
    `viewport ${run.config.viewport.width}x${run.config.viewport.height}, cutoff ${run.config.matchPercentCutoff}%`,
    '',
  ]

  const errors = run.results.filter((r) => r.status === 'error')
  if (errors.length) {
    lines.push('errors:')
    for (const r of errors) {
      lines.push(
        `  ${r.slug} A=${r.statusCodeA ?? '-'} B=${r.statusCodeB ?? '-'} ${firstLine(r.error ?? '')}`.trimEnd(),
      )
    }
    lines.push('')
  }

  if (pages.length) {
    if (cropDir) lines.push(`crops (A left | B right) in ${cropDir}`)
    lines.push('diffs (worst first; regions are y-ranges in page pixels):')
    for (const p of pages) {
      const size =
        p.heightA != null && p.heightB != null && p.heightA !== p.heightB
          ? ` height A=${p.heightA} B=${p.heightB}`
          : ''
      const regions = p.regions.map((r) => `${r.top}-${r.bottom}`).join(', ')
      lines.push(
        `  ${pct(p.result.mismatchPercent)} ${p.result.slug}${size}${regions ? ` regions ${regions}` : ''}`,
      )
      if (p.cropPaths.length) {
        const names = cropDir
          ? p.cropPaths.map((c) => c.slice(cropDir.length + 1))
          : p.cropPaths
        lines.push(`    ${names.join(' ')}`)
      }
    }
  }
  return lines.join('\n') + '\n'
}
