import { describe, it, expect } from 'vitest'
import { getErrorSlugs, getPendingSlugs, parseShortId } from './runResults'
import type { ComparisonRun } from './types'

function makeRun(partial: Partial<ComparisonRun>): ComparisonRun {
  return {
    id: '2026-06-25-abc123',
    baseUrlA: 'https://a',
    baseUrlB: 'https://b',
    createdAt: '2026-06-25T10:00:00.000Z',
    config: {
      viewport: { width: 1280, height: 720 },
      fullPage: true,
      delay: 0,
      threshold: 0.1,
    },
    slugs: ['/', '/about', '/contact'],
    results: [],
    status: 'running',
    ...partial,
  }
}

describe('getErrorSlugs', () => {
  it('returns only slugs whose result status is error', () => {
    const run = makeRun({
      results: [
        {
          slug: '/',
          mismatchPixels: 0,
          mismatchPercent: 0,
          status: 'match',
          sizeDiff: false,
          version: 1,
        },
        {
          slug: '/about',
          mismatchPixels: 0,
          mismatchPercent: 0,
          status: 'error',
          sizeDiff: false,
          version: 1,
          error: 'boom',
        },
      ],
    })
    expect(getErrorSlugs(run)).toEqual(['/about'])
  })
})

describe('getPendingSlugs', () => {
  it('returns target slugs that have no result yet', () => {
    const run = makeRun({
      results: [
        {
          slug: '/',
          mismatchPixels: 0,
          mismatchPercent: 0,
          status: 'match',
          sizeDiff: false,
          version: 1,
        },
      ],
    })
    expect(getPendingSlugs(run)).toEqual(['/about', '/contact'])
  })

  it('falls back to result slugs when slugs is missing (legacy runs)', () => {
    const run = makeRun({
      slugs: undefined as unknown as string[],
      results: [
        {
          slug: '/',
          mismatchPixels: 0,
          mismatchPercent: 0,
          status: 'match',
          sizeDiff: false,
          version: 1,
        },
      ],
    })
    expect(getPendingSlugs(run)).toEqual([])
  })
})

describe('parseShortId', () => {
  it('strips a leading date prefix', () => {
    expect(parseShortId('2026-06-25-abc123')).toBe('abc123')
  })

  it('returns the id unchanged when there is no date prefix', () => {
    expect(parseShortId('legacy-id')).toBe('legacy-id')
  })
})
