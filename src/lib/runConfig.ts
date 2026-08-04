import { DEFAULT_CONFIG } from './types'
import type { ComparisonConfig } from './types'

type ParseResult =
  | { ok: true; value: ComparisonConfig }
  | { ok: false; error: string }

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

/** A finite number in [min, max], or null when the value is unusable. */
function boundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value < min || value > max ? null : value
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

/**
 * Validate a client-supplied config and fill the gaps from DEFAULT_CONFIG.
 *
 * Shared by the two routes that accept one — creating a run and re-running an
 * existing one with edited settings — so the bounds cannot drift apart. Empty
 * selector lists are dropped rather than stored, so a cleared textarea reads
 * the same as one that was never filled in.
 */
export function parseRunConfig(input: unknown): ParseResult {
  if (input === undefined || input === null) {
    return { ok: true, value: { ...DEFAULT_CONFIG } }
  }
  if (!isPlainObject(input)) {
    return { ok: false, error: 'config must be an object' }
  }

  const threshold =
    input.threshold === undefined
      ? DEFAULT_CONFIG.threshold
      : boundedNumber(input.threshold, 0, 1)
  if (threshold === null) {
    return {
      ok: false,
      error: 'threshold must be a finite number between 0 and 1',
    }
  }

  const matchPercentCutoff =
    input.matchPercentCutoff === undefined
      ? DEFAULT_CONFIG.matchPercentCutoff
      : boundedNumber(input.matchPercentCutoff, 0, 100)
  if (matchPercentCutoff === null) {
    return {
      ok: false,
      error: 'matchPercentCutoff must be a finite number between 0 and 100',
    }
  }

  const delay =
    input.delay === undefined
      ? DEFAULT_CONFIG.delay
      : boundedNumber(input.delay, 0, 60000)
  if (delay === null) {
    return {
      ok: false,
      error: 'delay must be a finite number of milliseconds from 0 to 60000',
    }
  }

  let viewport = DEFAULT_CONFIG.viewport
  if (input.viewport !== undefined) {
    const supplied = input.viewport
    const width = isPlainObject(supplied)
      ? boundedNumber(supplied.width, 1, 10000)
      : null
    const height = isPlainObject(supplied)
      ? boundedNumber(supplied.height, 1, 10000)
      : null
    if (width === null || height === null) {
      return {
        ok: false,
        error: 'viewport must have a width and height between 1 and 10000',
      }
    }
    viewport = { width, height }
  }

  const selectors: Partial<
    Pick<ComparisonConfig, 'hideSelectors' | 'clickSelectors'>
  > = {}
  for (const field of ['hideSelectors', 'clickSelectors'] as const) {
    if (input[field] === undefined) continue
    const list = stringArray(input[field])
    if (list === null) {
      return { ok: false, error: `${field} must be an array of strings` }
    }
    if (list.length) selectors[field] = list
  }

  return {
    ok: true,
    value: {
      viewport,
      fullPage: input.fullPage ?? DEFAULT_CONFIG.fullPage,
      delay,
      threshold,
      matchPercentCutoff,
      excludeHttpErrors:
        input.excludeHttpErrors ?? DEFAULT_CONFIG.excludeHttpErrors,
      ...selectors,
    } as ComparisonConfig,
  }
}
