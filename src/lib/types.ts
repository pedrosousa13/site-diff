export interface ComparisonConfig {
  viewport: { width: number; height: number }
  fullPage: boolean
  delay: number
  threshold: number
  hideSelectors?: string[]
  clickSelectors?: string[]
}

export interface PageResult {
  slug: string
  mismatchPixels: number
  mismatchPercent: number
  status: 'match' | 'diff' | 'error'
  sizeDiff: boolean
  error?: string
  version: number
  checked?: boolean
  viewed?: boolean
}

/** A page whose path differs between the two environments. */
export interface SlugPair {
  a: string
  b: string
}

export interface ComparisonRun {
  id: string
  baseUrlA: string
  baseUrlB: string
  createdAt: string
  config: ComparisonConfig
  /** Canonical page identities. In pair mode these are the A-side slugs
   * (slugs[i] === slugPairs[i].a); results, filenames, and re-runs all key on
   * them. */
  slugs: string[]
  /** Present only for runs created in "different slugs per environment" mode.
   * Paired by index with `slugs`. Absent on shared-slug and legacy runs. */
  slugPairs?: SlugPair[]
  results: PageResult[]
  status: 'running' | 'completed' | 'failed'
  /** How many slugs to process in parallel. See runner.ts. Clamped to [1, MAX_CONCURRENCY]. */
  concurrency?: number
}

export const DEFAULT_CONFIG: ComparisonConfig = {
  viewport: { width: 1280, height: 720 },
  fullPage: true,
  delay: 500,
  threshold: 0.1,
}

/** Upper bound for parallel slug processing. Each slug renders 2 pages, so the
 * real peak of concurrent Chromium contexts is 2x this. Keep modest on laptops. */
export const MAX_CONCURRENCY = 5
export const DEFAULT_CONCURRENCY = 3

/** Clamp a requested concurrency to [1, MAX_CONCURRENCY], falling back to the
 * default for missing/invalid values (0, NaN, undefined). */
export function clampConcurrency(value: number | undefined): number {
  return Math.min(
    Math.max(1, Number(value) || DEFAULT_CONCURRENCY),
    MAX_CONCURRENCY,
  )
}
