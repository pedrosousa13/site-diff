import type { SlugPair } from './types'

export type SlugPairsResult =
  | { ok: true; pairs: SlugPair[] }
  | { ok: false; error: string }

/**
 * Pair two textareas line-by-line for "different slugs per environment" mode.
 * Trims lines and ignores trailing blank lines on both sides; a line that is
 * blank on both sides is skipped. A line blank on exactly one side, a
 * line-count mismatch, or a duplicate A-slug is an error rather than being
 * silently dropped — dropping would shift the pairing of every later line.
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

  const pairs: SlugPair[] = []
  const seenA = new Set<string>()
  for (let i = 0; i < linesA.length; i++) {
    const a = linesA[i]
    const b = linesB[i]
    if (!a && !b) continue
    if (!a || !b) {
      return {
        ok: false,
        error: `Line ${i + 1}: slug missing for environment ${a ? 'B' : 'A'}`,
      }
    }
    if (seenA.has(a)) {
      return {
        ok: false,
        error: `Duplicate environment-A slug "${a}" on line ${i + 1}`,
      }
    }
    seenA.add(a)
    pairs.push({ a, b })
  }

  if (!pairs.length) return { ok: false, error: 'Enter at least one slug pair' }
  return { ok: true, pairs }
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

  const pairs: SlugPair[] = []
  const seenA = new Set<string>()
  for (let i = 0; i < input.length; i++) {
    const entry = input[i] as Partial<SlugPair> | null
    const a = typeof entry?.a === 'string' ? entry.a.trim() : ''
    const b = typeof entry?.b === 'string' ? entry.b.trim() : ''
    if (!a || !b) {
      return {
        ok: false,
        error: `slugPairs[${i}] must have non-empty "a" and "b" slugs`,
      }
    }
    if (seenA.has(a)) {
      return { ok: false, error: `Duplicate environment-A slug "${a}"` }
    }
    seenA.add(a)
    pairs.push({ a, b })
  }

  return { ok: true, pairs }
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
