import { NextRequest, NextResponse } from 'next/server'
import {
  getMetadata,
  deleteRun,
  saveMetadata,
  isSafeRunId,
} from '@/lib/storage'
import { withRunLock } from '@/lib/runner'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const run = await getMetadata(id)

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  return NextResponse.json(run)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!isSafeRunId(id)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 })
  }

  try {
    // Delete under the run lock so we can't race an in-flight appendResult,
    // and refuse while the background runner is still writing to the run.
    const outcome = await withRunLock(id, async () => {
      const run = await getMetadata(id)
      if (run?.status === 'running') return 'running' as const
      await deleteRun(id)
      return 'deleted' as const
    })

    if (outcome === 'running') {
      return NextResponse.json(
        { error: 'Run is still in progress and cannot be deleted' },
        { status: 409 },
      )
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete run' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('not an object')
    }
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'Expected a JSON object body' },
      { status: 400 },
    )
  }
  const { slug } = body

  // Read-modify-write under the run lock with a fresh read, so review updates
  // don't clobber a result an in-flight appendResult is writing.
  const outcome = await withRunLock(id, async () => {
    const run = await getMetadata(id)
    if (!run) return 'run-not-found' as const
    const result = run.results.find((r) => r.slug === slug)
    if (!result) return 'slug-not-found' as const
    if ('checked' in body) result.checked = Boolean(body.checked)
    if ('viewed' in body) result.viewed = Boolean(body.viewed)
    await saveMetadata(run)
    return 'ok' as const
  })

  if (outcome === 'run-not-found') {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  if (outcome === 'slug-not-found') {
    return NextResponse.json({ error: 'Slug not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
