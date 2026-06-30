import type { ComparisonRun } from './types'

/** Every slug the run covers. Falls back to result slugs for older runs that
 * predate the `slugs` field. */
export function getAllSlugs(run: ComparisonRun): string[] {
  return run.slugs ?? run.results.map((r) => r.slug)
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
