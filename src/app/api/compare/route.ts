import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { ensureRunDir, saveMetadata } from '@/lib/storage'
import { startRun } from '@/lib/runner'
import { clampConcurrency } from '@/lib/types'
import type { ComparisonRun, ComparisonConfig } from '@/lib/types'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { baseUrlA, baseUrlB, slugs, config: userConfig } = body
  const concurrency = clampConcurrency(Number(body.concurrency))

  if (!baseUrlA || !baseUrlB || !slugs?.length) {
    return NextResponse.json(
      { error: 'Missing required fields: baseUrlA, baseUrlB, slugs' },
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
    results: [],
    status: 'running',
    concurrency,
  }

  await ensureRunDir(runId)
  await saveMetadata(run)
  startRun(run, slugs)

  return NextResponse.json({ id: runId })
}
