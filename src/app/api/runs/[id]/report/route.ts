import { promises as fs } from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import { NextRequest, NextResponse } from 'next/server'
import {
  getDiffPath,
  getMetadata,
  getScreenshotPath,
  isSafeRunId,
} from '@/lib/storage'
import { cropPair, findDiffRegions, formatReport } from '@/lib/aiReport'
import type { ReportPage } from '@/lib/aiReport'

const readPng = async (file: string) => PNG.sync.read(await fs.readFile(file))

/**
 * GET /api/runs/:id/report?top=20
 *
 * Plain-text summary of a run for an AI reader: counts, errors, and the `top`
 * worst diff pages with their changed y-ranges. For each changed region it
 * writes one small A|B crop to data/runs/:id/report/ and lists its path, so the
 * reader opens a few crops instead of full-page screenshots.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isSafeRunId(id)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 })
  }
  const run = await getMetadata(id)
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const top = Math.max(
    1,
    Math.min(200, Number(request.nextUrl.searchParams.get('top')) || 20),
  )
  const reportDir = path.join(
    path.dirname(getDiffPath(id, '/')),
    '..',
    'report',
  )
  await fs.mkdir(reportDir, { recursive: true })

  const worst = run.results
    .filter((r) => r.status === 'diff')
    .sort((a, b) => b.mismatchPercent - a.mismatchPercent)
    .slice(0, top)

  const pages: ReportPage[] = []
  for (const result of worst) {
    try {
      const [diff, a, b] = await Promise.all([
        readPng(getDiffPath(id, result.slug)),
        readPng(getScreenshotPath(id, 'a', result.slug)),
        readPng(getScreenshotPath(id, 'b', result.slug)),
      ])
      const regions = findDiffRegions(diff)
      const base = path.basename(getDiffPath(id, result.slug), '.png')
      const cropPaths: string[] = []
      for (const [i, region] of regions.entries()) {
        const file = path.join(reportDir, `${base}-r${i + 1}.png`)
        await fs.writeFile(file, PNG.sync.write(cropPair(a, b, region)))
        cropPaths.push(path.resolve(file))
      }
      pages.push({
        result,
        heightA: a.height,
        heightB: b.height,
        regions,
        cropPaths,
      })
    } catch {
      // Missing screenshots (an older or partial run): list the page anyway.
      pages.push({ result, regions: [], cropPaths: [] })
    }
  }

  return new NextResponse(formatReport(run, pages, path.resolve(reportDir)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
