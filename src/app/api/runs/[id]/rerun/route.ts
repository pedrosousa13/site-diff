import { NextRequest, NextResponse } from 'next/server'
import { getMetadata, saveMetadata } from '@/lib/storage'
import { getAllSlugs, getErrorSlugs } from '@/lib/runResults'
import { startRun, withRunLock } from '@/lib/runner'
import { parseRunConfig } from '@/lib/runConfig'
import { clampConcurrency } from '@/lib/types'

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

  // A body without `config` re-runs with whatever the run already stores, which
  // is what the "Re-run failed" and per-card buttons want. Editing settings
  // sends one, and it replaces the stored config for good: screenshots are
  // overwritten, so a stale config would no longer describe the results.
  if (body?.config !== undefined) {
    const parsed = parseRunConfig(body.config)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    run.config = parsed.value
    if (body.concurrency !== undefined) {
      run.concurrency = clampConcurrency(Number(body.concurrency))
    }
  }

  // Flip status under the run lock with a fresh read so we don't clobber a
  // result an in-flight appendResult is writing while results still stream in.
  await withRunLock(id, async () => {
    const fresh = await getMetadata(id)
    if (!fresh) return
    fresh.status = 'running'
    fresh.config = run.config
    fresh.concurrency = run.concurrency
    await saveMetadata(fresh)
  })
  // Hand over the run carrying the edited config: startRun reads config off the
  // object it is given, not off disk.
  startRun(run, targetSlugs)

  return NextResponse.json({ id, slugs: targetSlugs })
}
