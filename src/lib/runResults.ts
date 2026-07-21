import type { ComparisonRun, PageResult } from './types'

export type ResultSortMode = 'diff-desc' | 'name' | 'status'

/** Every slug the run covers, keyed on the environment-A slug. Prefers
 * `slugPairs` (the source of truth in pair mode), then `slugs`, and finally
 * result slugs for older runs that predate both fields. */
export function getAllSlugs(run: ComparisonRun): string[] {
  if (run.slugPairs) return run.slugPairs.map((p) => p.a)
  return run.slugs ?? run.results.map((r) => r.slug)
}

/** A-slug → B-slug lookup for pair runs. Empty for shared-slug and legacy
 * runs — callers fall back with `map.get(slug) ?? slug`. Built once per run
 * snapshot so per-card renders avoid a linear find. */
export function getSlugBMap(run: ComparisonRun): Map<string, string> {
  return new Map((run.slugPairs ?? []).map((p) => [p.a, p.b]))
}

export function getErrorSlugs(run: ComparisonRun): string[] {
  return run.results.filter((r) => r.status === 'error').map((r) => r.slug)
}

export function getPendingSlugs(run: ComparisonRun): string[] {
  const done = new Set(run.results.map((r) => r.slug))
  return getAllSlugs(run).filter((slug) => !done.has(slug))
}

export function sortResultSlugs(
  run: ComparisonRun,
  mode: ResultSortMode,
): string[] {
  const results = new Map(run.results.map((result) => [result.slug, result]))
  const slugs = [...getAllSlugs(run)]
  // Pin the locale so sort order does not depend on the server's environment.
  const byName = (a: string, b: string) => a.localeCompare(b, 'en')

  if (mode === 'name') return slugs.sort(byName)

  if (mode === 'status') {
    const statusOrder: Record<PageResult['status'], number> = {
      error: 0,
      diff: 1,
      match: 2,
    }
    const statusRank = (slug: string) => {
      const result = results.get(slug)
      return result ? statusOrder[result.status] : 3
    }
    return slugs.sort((a, b) => statusRank(a) - statusRank(b) || byName(a, b))
  }

  const resultGroupRank = (slug: string) => {
    const result = results.get(slug)
    if (!result) return 2
    return result.status === 'error' ? 1 : 0
  }
  return slugs.sort((a, b) => {
    const groupOrder = resultGroupRank(a) - resultGroupRank(b)
    if (groupOrder) return groupOrder

    const resultA = results.get(a)
    const resultB = results.get(b)
    if (resultA?.status !== 'error' && resultB?.status !== 'error') {
      const diffOrder =
        (resultB?.mismatchPercent ?? 0) - (resultA?.mismatchPercent ?? 0)
      if (diffOrder) return diffOrder
    }
    return byName(a, b)
  })
}

export function parseShortId(runId: string): string {
  return runId.replace(/^\d{4}-\d{2}-\d{2}-/, '')
}
