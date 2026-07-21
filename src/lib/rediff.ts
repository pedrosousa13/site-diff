export interface RediffRequest {
  slug: string
  threshold: number
}

type RediffRequestResult =
  | { ok: true; value: RediffRequest }
  | { ok: false; error: string }

export function parseRediffRequest(input: unknown): RediffRequestResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Expected a JSON request body' }
  }

  const { slug, threshold } = input as Record<string, unknown>
  if (typeof slug !== 'string' || !slug) {
    return { ok: false, error: 'slug must be a non-empty string' }
  }
  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  ) {
    return { ok: false, error: 'threshold must be a number from 0 to 1' }
  }

  return { ok: true, value: { slug, threshold } }
}
