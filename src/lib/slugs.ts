import type { SlugPair } from './types'

export type SlugPairsResult =
  | { ok: true; pairs: SlugPair[] }
  | { ok: false; error: string }

export interface SlugLineError {
  line: number
  message: string
}

export interface ParsedSlugLines {
  pairs: SlugPair[]
  errors: SlugLineError[]
}

/** Messages a caller supplies for the per-row validation failures, so the two
 * entry points can phrase errors in their own terms (line numbers vs indices). */
interface PairMessages {
  missing: (index: number, aPresent: boolean) => string
  duplicate: (index: number, a: string) => string
  absolute: (index: number, slug: string) => string
}

/**
 * Shared core for both entry points: apply the pairing rules to already-trimmed
 * `{ a, b }` rows. A row blank on both sides is skipped; a row blank on exactly
 * one side or a duplicate A-slug is an error rather than being silently dropped
 * — dropping would shift the pairing of every later row.
 */
function collectPairs(
  rows: SlugPair[],
  messages: PairMessages,
): SlugPairsResult {
  const pairs: SlugPair[] = []
  const seenA = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const { a, b } = rows[i]
    if (!a && !b) continue
    if (!a || !b) {
      return { ok: false, error: messages.missing(i, Boolean(a)) }
    }
    if (isAbsoluteUrl(a) || isAbsoluteUrl(b)) {
      return {
        ok: false,
        error: messages.absolute(i, isAbsoluteUrl(a) ? a : b),
      }
    }
    if (seenA.has(a)) {
      return { ok: false, error: messages.duplicate(i, a) }
    }
    seenA.add(a)
    pairs.push({ a, b })
  }

  if (!pairs.length) return { ok: false, error: 'Enter at least one slug pair' }
  return { ok: true, pairs }
}

/**
 * Validate an untrusted `slugPairs` API payload: non-empty trimmed slugs on
 * both sides, no absolute URLs, unique A-slugs — applied to already-zipped
 * `{ a, b }` entries.
 */
export function validateSlugPairs(input: unknown): SlugPairsResult {
  if (!Array.isArray(input) || !input.length) {
    return { ok: false, error: 'slugPairs must be a non-empty array' }
  }

  const rows = input.map((entry) => {
    const e = entry as Partial<SlugPair> | null
    return {
      a: typeof e?.a === 'string' ? e.a.trim() : '',
      b: typeof e?.b === 'string' ? e.b.trim() : '',
    }
  })
  return collectPairs(rows, {
    missing: (i) => `slugPairs[${i}] must have non-empty "a" and "b" slugs`,
    duplicate: (_i, a) => `Duplicate environment-A slug "${a}"`,
    absolute: (i, slug) =>
      `slugPairs[${i}]: "${slug}" is an absolute URL — use a path, the base URLs provide the host`,
  })
}

export type SlugsResult =
  | { ok: true; slugs: string[] }
  | { ok: false; error: string }

/** Validate an untrusted `slugs` API payload: an array of strings with at
 * least one non-empty entry. Trims and dedupes, preserving order. */
export function validateSlugs(input: unknown): SlugsResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'slugs must be an array of strings' }
  }
  const seen = new Set<string>()
  const slugs: string[] = []
  for (const entry of input) {
    if (typeof entry !== 'string') {
      return { ok: false, error: 'slugs must be an array of strings' }
    }
    const slug = entry.trim()
    if (!slug || seen.has(slug)) continue
    if (isAbsoluteUrl(slug)) {
      return {
        ok: false,
        error: `"${slug}" is an absolute URL — use a path, the base URLs provide the host`,
      }
    }
    seen.add(slug)
    slugs.push(slug)
  }
  if (!slugs.length) {
    return {
      ok: false,
      error: 'slugs must contain at least one non-empty slug',
    }
  }
  return { ok: true, slugs }
}

/**
 * Merge checklist-selected slugs (implicitly shared) with pairs typed in the
 * textarea. Selected slugs come first in first-seen order; a typed pair whose
 * A-slug is also selected overrides that entry's B-slug in place, because an
 * explicit `a -> b` mapping beats the implicit shared one.
 */
export function mergeSlugPairs(
  selected: Iterable<string>,
  typed: SlugPair[],
): SlugPair[] {
  const out: SlugPair[] = []
  const indexByA = new Map<string, number>()

  for (const raw of selected) {
    const slug = raw.trim()
    if (!slug || indexByA.has(slug)) continue
    indexByA.set(slug, out.length)
    out.push({ a: slug, b: slug })
  }
  for (const pair of typed) {
    const at = indexByA.get(pair.a)
    if (at !== undefined) {
      out[at] = pair
    } else {
      indexByA.set(pair.a, out.length)
      out.push(pair)
    }
  }

  return out
}

const ARROW = '->'

function isAbsoluteUrl(slug: string): boolean {
  return /^https?:\/\//i.test(slug)
}

/**
 * Parse the slugs textarea. One page per line: a plain line is a shared slug,
 * `a -> b` pairs different slugs per environment. Pairing is per-line, so
 * editing one line never shifts the pairing of the others. Error lines are
 * reported individually and contribute no pair.
 */
export function parseSlugLines(text: string): ParsedSlugLines {
  const pairs: SlugPair[] = []
  const errors: SlugLineError[] = []
  const seenA = new Set<string>()

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNo = i + 1
    if (!line) continue

    const parts = line.split(ARROW).map((part) => part.trim())
    if (parts.length > 2) {
      errors.push({ line: lineNo, message: `more than one "${ARROW}"` })
      continue
    }
    const [a, b] = parts.length === 2 ? parts : [parts[0], parts[0]]
    if (!a || !b) {
      errors.push({
        line: lineNo,
        message: `missing slug ${a ? 'after' : 'before'} "${ARROW}"`,
      })
      continue
    }
    if (isAbsoluteUrl(a) || isAbsoluteUrl(b)) {
      errors.push({
        line: lineNo,
        message: 'use a path like /about — the Base URLs provide the host',
      })
      continue
    }
    if (seenA.has(a)) {
      errors.push({ line: lineNo, message: `duplicate slug "${a}"` })
      continue
    }
    seenA.add(a)
    pairs.push({ a, b })
  }

  return { pairs, errors }
}
