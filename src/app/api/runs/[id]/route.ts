import { NextRequest, NextResponse } from 'next/server'
import { getMetadata, deleteRun, saveMetadata } from '@/lib/storage'
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

  try {
    await deleteRun(id)
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
