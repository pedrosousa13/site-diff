import { NextRequest, NextResponse } from 'next/server'
import { getMetadata, saveMetadata } from '@/lib/storage'
import { getAllSlugs, getErrorSlugs } from '@/lib/runResults'
import { startRun, withRunLock } from '@/lib/runner'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const run = await getMetadata(id)
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const requested: string[] | undefined = body?.slugs
  const allSlugs = getAllSlugs(run)
  const targetSlugs = (
    requested && requested.length ? requested : getErrorSlugs(run)
  ).filter((slug) => allSlugs.includes(slug))

  if (!targetSlugs.length) {
    return NextResponse.json({ error: 'No slugs to re-run' }, { status: 400 })
  }

  // Flip status under the run lock with a fresh read so we don't clobber a
  // result an in-flight appendResult is writing while results still stream in.
  await withRunLock(id, async () => {
    const fresh = await getMetadata(id)
    if (!fresh) return
    fresh.status = 'running'
    await saveMetadata(fresh)
  })
  startRun(run, targetSlugs)

  return NextResponse.json({ id, slugs: targetSlugs })
}
