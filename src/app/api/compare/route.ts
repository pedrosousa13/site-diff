import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { ensureRunDir, saveMetadata } from '@/lib/storage'
import { startRun } from '@/lib/runner'
import { validateSlugPairs, validateSlugs } from '@/lib/slugs'
import { clampConcurrency } from '@/lib/types'
import type { ComparisonRun, ComparisonConfig, SlugPair } from '@/lib/types'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { baseUrlA, baseUrlB, config: userConfig } = body
  const concurrency = clampConcurrency(Number(body.concurrency))

  // Clients send either a shared slug list or per-environment slug pairs.
  // Both are re-validated here; `slugs` becomes the A-side identity list.
  let slugs: string[]
  let slugPairs: SlugPair[] | undefined
  if (body.slugPairs != null) {
    const validated = validateSlugPairs(body.slugPairs)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    slugPairs = validated.pairs
    slugs = slugPairs.map((p) => p.a)
  } else {
    const validated = validateSlugs(body.slugs)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    slugs = validated.slugs
  }

  if (!baseUrlA || !baseUrlB) {
    return NextResponse.json(
      { error: 'Missing required fields: baseUrlA, baseUrlB' },
      { status: 400 },
    )
  }

  const runId = `${new Date().toISOString().split('T')[0]}-${nanoid(8)}`
  const config: ComparisonConfig = {
    viewport: userConfig?.viewport || { width: 1280, height: 720 },
    fullPage: userConfig?.fullPage ?? true,
    delay: userConfig?.delay ?? 500,
    threshold: userConfig?.threshold ?? 0.1,
    hideSelectors: userConfig?.hideSelectors,
    clickSelectors: userConfig?.clickSelectors,
  }

  const run: ComparisonRun = {
    id: runId,
    baseUrlA,
    baseUrlB,
    createdAt: new Date().toISOString(),
    config,
    slugs,
    ...(slugPairs && { slugPairs }),
    results: [],
    status: 'running',
    concurrency,
  }

  await ensureRunDir(runId)
  await saveMetadata(run)
  startRun(run, slugs)

  return NextResponse.json({ id: runId })
}
