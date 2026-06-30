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
