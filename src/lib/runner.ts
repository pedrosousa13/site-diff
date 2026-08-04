import {
  takeScreenshot,
  closeBrowser,
  type ScreenshotResult,
} from './screenshotter'
import { diffImages, determineStatus } from './differ'
import {
  getMetadata,
  saveMetadata,
  getDiffPath,
  getScreenshotPath,
} from './storage'
import { mapWithConcurrency } from './concurrency'
import { getSlugBMap } from './runResults'
import { DEFAULT_CONCURRENCY } from './types'
import type { ComparisonRun, PageResult } from './types'

/** Serialize async tasks in FIFO order. A rejection does not break the chain. */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve()
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    // then(fn, fn) passes fn as both handlers: fn always runs whether the prior
    // task resolved or rejected (FIFO). result.catch suppresses the rejection
    // on the tail so the next enqueued task also always runs.
    const result = tail.then(fn, fn)
    tail = result.catch(() => {})
    return result
  }
}

// One save-mutex per run id so concurrent slug completions can't clobber meta.json.
const saveLocks = new Map<string, ReturnType<typeof createMutex>>()
function saveLockFor(runId: string) {
  let m = saveLocks.get(runId)
  if (!m) {
    m = createMutex()
    saveLocks.set(runId, m)
  }
  return m
}

/**
 * Run a read-modify-write of a run's meta.json under its save-mutex, so callers
 * outside the runner (re-run, mark-checked) can't clobber a result an in-flight
 * appendResult is writing. Always re-read via getMetadata inside `fn`.
 */
export function withRunLock<T>(
  runId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return saveLockFor(runId)(fn)
}

// Keep the shared browser open while any run is in flight.
let activeRuns = 0

/**
 * One log line naming the click selectors that never appeared, or null when
 * they all matched. A miss costs the click timeout on every page and on both
 * sides, so a typo is worth a line in the log instead of a silent slowdown.
 * The same selector missing on both sides is one mistake, so it is named once.
 */
export function unmatchedClickWarning(
  slug: string,
  sides: PromiseSettledResult<ScreenshotResult>[],
): string | null {
  const selectors = new Set(
    sides.flatMap((settled) =>
      settled.status === 'fulfilled'
        ? (settled.value.unmatchedClickSelectors ?? [])
        : [],
    ),
  )
  if (!selectors.size) return null
  return `Click selectors never matched on ${slug}: ${[...selectors].join(', ')}`
}

export async function compareSlug(
  run: ComparisonRun,
  slug: string,
  version: number,
  slugBMap: Map<string, string>,
): Promise<PageResult> {
  const { id: runId, baseUrlA, baseUrlB, config } = run
  const urlA = new URL(slug, baseUrlA).toString()
  // In pair mode environment B has its own slug; storage stays keyed on the
  // A-slug (page identity), including the side-b screenshot below.
  const urlB = new URL(slugBMap.get(slug) ?? slug, baseUrlB).toString()
  const pathA = getScreenshotPath(runId, 'a', slug)
  const pathB = getScreenshotPath(runId, 'b', slug)

  // Never throw: any failure (screenshot or diff) becomes an error result so a
  // single bad slug can't abort the batch or strand the run in 'running'.
  try {
    const [settledA, settledB] = await Promise.allSettled([
      takeScreenshot(urlA, pathA, config),
      takeScreenshot(urlB, pathB, config),
    ])

    const warning = unmatchedClickWarning(slug, [settledA, settledB])
    if (warning) console.warn(warning)

    const problem = (
      side: 'A' | 'B',
      settled: PromiseSettledResult<ScreenshotResult>,
    ): string | null => {
      if (settled.status === 'rejected') {
        const reason = settled.reason
        return `${side} failed: ${reason instanceof Error ? reason.message : String(reason)}`
      }
      return settled.value.excluded
        ? `${side} returned HTTP ${settled.value.statusCode}`
        : null
    }
    const statusCode = (settled: PromiseSettledResult<ScreenshotResult>) =>
      settled.status === 'fulfilled' && settled.value.excluded
        ? (settled.value.statusCode ?? undefined)
        : undefined

    const problems = [problem('A', settledA), problem('B', settledB)].filter(
      (message): message is string => Boolean(message),
    )
    if (problems.length > 0) {
      return {
        slug,
        mismatchPixels: 0,
        mismatchPercent: 0,
        status: 'error',
        sizeDiff: false,
        version,
        error: problems.join('; '),
        statusCodeA: statusCode(settledA),
        statusCodeB: statusCode(settledB),
      }
    }

    const diffPath = getDiffPath(runId, slug)
    const diff = await diffImages(pathA, pathB, diffPath, config.threshold)
    return {
      slug,
      mismatchPixels: diff.mismatchPixels,
      mismatchPercent: diff.mismatchPercent,
      status: determineStatus(diff.mismatchPercent, config.matchPercentCutoff),
      sizeDiff: diff.sizeDiff,
      version,
    }
  } catch (error) {
    return {
      slug,
      mismatchPixels: 0,
      mismatchPercent: 0,
      status: 'error',
      sizeDiff: false,
      version,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function appendResult(runId: string, result: PageResult): Promise<void> {
  await saveLockFor(runId)(async () => {
    const run = await getMetadata(runId)
    if (!run) return
    // Intentionally replaces the full result — this clears the `checked` flag on re-run,
    // so the user is prompted to re-review the updated diff.
    const idx = run.results.findIndex((r) => r.slug === result.slug)
    if (idx >= 0) run.results[idx] = result
    else run.results.push(result)
    await saveMetadata(run)
  })
}

async function finalizeStatus(runId: string): Promise<void> {
  await saveLockFor(runId)(async () => {
    const run = await getMetadata(runId)
    if (!run) return
    const total = run.slugs?.length ?? run.results.length
    run.status = run.results.length >= total ? 'completed' : 'running'
    await saveMetadata(run)
  })
  // Run is settled; drop its mutex so the map doesn't grow unbounded over time.
  saveLocks.delete(runId)
}

/** Fire-and-forget background processing of `slugs` for `run`. */
export function startRun(run: ComparisonRun, slugs: string[]): void {
  activeRuns++
  // Already clamped to [1, MAX_CONCURRENCY] when the run was created (compare route).
  // Each slug renders 2 pages in parallel, so peak Chromium contexts is 2x this.
  const concurrency = run.concurrency ?? DEFAULT_CONCURRENCY
  const slugBMap = getSlugBMap(run)
  void (async () => {
    try {
      await mapWithConcurrency(slugs, concurrency, async (slug) => {
        const current = await getMetadata(run.id)
        const existing = current?.results.find((r) => r.slug === slug)
        const version = (existing?.version ?? 0) + 1
        const result = await compareSlug(run, slug, version, slugBMap)
        await appendResult(run.id, result)
      })
    } finally {
      // Always finalize, even if a slug's appendResult rejected, so the run
      // never stays 'running' forever. The inner finally guarantees the
      // activeRuns bookkeeping and browser close still run if finalizeStatus
      // itself throws (e.g. disk full), so a run can't leak the shared browser.
      try {
        await finalizeStatus(run.id)
      } finally {
        activeRuns--
        if (activeRuns === 0) await closeBrowser()
      }
    }
  })()
}
