import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { ensureRunDir, saveMetadata } from '@/lib/storage'
import { startRun } from '@/lib/runner'
import { validateSlugPairs, validateSlugs } from '@/lib/slugs'
import { parseRunConfig } from '@/lib/runConfig'
import { clampConcurrency } from '@/lib/types'
import type { ComparisonRun, SlugPair } from '@/lib/types'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { baseUrlA, baseUrlB } = body
  const concurrency = clampConcurrency(Number(body.concurrency))

  const parsedConfig = parseRunConfig(body.config)
  if (!parsedConfig.ok) {
    return NextResponse.json({ error: parsedConfig.error }, { status: 400 })
  }
  const config = parsedConfig.value

  // Clients send either a shared slug list or per-environment slug pairs.
  // Both are validated here; `slugs` becomes the A-side identity list.
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
