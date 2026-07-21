import { describe, expect, it } from 'vitest'
import { parseRediffRequest } from './rediff'

describe('parseRediffRequest', () => {
  it('accepts a slug and threshold in the pixelmatch range', () => {
    expect(parseRediffRequest({ slug: '/about', threshold: 0.25 })).toEqual({
      ok: true,
      value: { slug: '/about', threshold: 0.25 },
    })
  })

  it.each([
    null,
    {},
    { slug: '', threshold: 0.1 },
    { slug: '/', threshold: '0.1' },
    { slug: '/', threshold: Number.NaN },
    { slug: '/', threshold: -0.01 },
    { slug: '/', threshold: 1.01 },
  ])('rejects invalid request %#', (request) => {
    expect(parseRediffRequest(request).ok).toBe(false)
  })
})
