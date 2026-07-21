import { NextRequest, NextResponse } from 'next/server'
import { diffImagesToBuffer } from '@/lib/differ'
import { parseRediffRequest } from '@/lib/rediff'
import { getAllSlugs } from '@/lib/runResults'
import { getMetadata, getScreenshotPath, isSafeRunId } from '@/lib/storage'

export const runtime = 'nodejs'

// Serialize load: PNG decode/diff/encode blocks the event loop for ~2s on
// tall pages (see docs/spikes/live-threshold-viewer.md), so cap concurrent
// re-diffs per process instead of queueing unbounded work.
const MAX_CONCURRENT_REDIFFS = 2
let inFlight = 0

export function __resetInFlightForTests() {
  inFlight = 0
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isSafeRunId(id)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Expected a JSON request body' },
      { status: 400 },
    )
  }

  const parsed = parseRediffRequest(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const run = await getMetadata(id)
  if (!run || run.id !== id) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  if (!getAllSlugs(run).includes(parsed.value.slug)) {
    return NextResponse.json({ error: 'Slug not found' }, { status: 404 })
  }
  if (run.status === 'running') {
    return NextResponse.json(
      { error: 'Run is still in progress' },
      { status: 409 },
    )
  }

  if (inFlight >= MAX_CONCURRENT_REDIFFS) {
    return NextResponse.json(
      { error: 'Too many re-diffs in flight' },
      { status: 429 },
    )
  }

  const { slug, threshold } = parsed.value
  inFlight++
  try {
    const result = await diffImagesToBuffer(
      getScreenshotPath(id, 'a', slug),
      getScreenshotPath(id, 'b', slug),
      threshold,
    )

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'X-Site-Diff-Threshold': String(threshold),
        'X-Site-Diff-Mismatch-Pixels': String(result.mismatchPixels),
        'X-Site-Diff-Mismatch-Percent': String(result.mismatchPercent),
      },
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Cached screenshots not found' },
        { status: 404 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to re-diff page' },
      { status: 500 },
    )
  } finally {
    inFlight--
  }
}
