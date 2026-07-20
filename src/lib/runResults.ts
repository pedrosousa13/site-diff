import type { ComparisonRun } from './types'

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

export function parseShortId(runId: string): string {
  return runId.replace(/^\d{4}-\d{2}-\d{2}-/, '')
}
