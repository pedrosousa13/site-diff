/** Parse the match-cutoff text field. Returns null for empty or invalid
 * input so an emptied field never silently coerces to 0. */
export function parseMatchPercentCutoff(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}
