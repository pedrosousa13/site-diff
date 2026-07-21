/** Split a textarea's worth of CSS selectors: one per line, trimmed,
 * blank lines dropped. Shared by the click and hide selector fields. */
export function parseSelectorLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Returns the first selector the DOM rejects, or null when all parse.
 * Requires a DOM (browser or jsdom). */
export function findInvalidSelector(selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      document.querySelector(sel)
    } catch {
      return sel
    }
  }
  return null
}
