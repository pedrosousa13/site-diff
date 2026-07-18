import type { SlugPair } from './types'

export type SlugPairsResult =
  | { ok: true; pairs: SlugPair[] }
  | { ok: false; error: string }

/** Messages a caller supplies for the per-row validation failures, so the two
 * entry points can phrase errors in their own terms (line numbers vs indices). */
interface PairMessages {
  missing: (index: number, aPresent: boolean) => string
  duplicate: (index: number, a: string) => string
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
 * Pair two textareas line-by-line for "different slugs per environment" mode.
 * Trims lines and ignores trailing blank lines on both sides, then applies the
 * shared pairing rules (see collectPairs).
 */
export function zipSlugPairs(textA: string, textB: string): SlugPairsResult {
  const linesA = textA.split('\n').map((line) => line.trim())
  const linesB = textB.split('\n').map((line) => line.trim())
  while (linesA.length && !linesA[linesA.length - 1]) linesA.pop()
  while (linesB.length && !linesB[linesB.length - 1]) linesB.pop()

  if (linesA.length !== linesB.length) {
    return {
      ok: false,
      error: `Environment A has ${linesA.length} slugs but environment B has ${linesB.length} — each line in A must pair with the same line in B`,
    }
  }

  const rows = linesA.map((a, i) => ({ a, b: linesB[i] }))
  return collectPairs(rows, {
    missing: (i, aPresent) =>
      `Line ${i + 1}: slug missing for environment ${aPresent ? 'B' : 'A'}`,
    duplicate: (i, a) => `Duplicate environment-A slug "${a}" on line ${i + 1}`,
  })
}

/**
 * Validate an untrusted `slugPairs` API payload. Same rules as zipSlugPairs
 * (non-empty trimmed slugs on both sides, unique A-slugs) applied to
 * already-zipped `{ a, b }` entries.
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
  })
}

/**
 * Merge checklist-selected slugs with manually typed lines.
 * Trims entries, drops empties, removes duplicates, and preserves
 * first-seen order (selected first, then manual-only).
 */
export function mergeSlugs(
  selected: Iterable<string>,
  manualText: string,
): string[] {
  const manual = manualText.split('\n')
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of [...selected, ...manual]) {
    const slug = raw.trim()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
  }

  return out
}
