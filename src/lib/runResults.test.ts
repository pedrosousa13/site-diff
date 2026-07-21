import { describe, it, expect } from 'vitest'
import {
  getErrorSlugs,
  getPendingSlugs,
  getSlugBMap,
  parseShortId,
  sortResultSlugs,
} from './runResults'
import type { ComparisonRun, PageResult } from './types'

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

function makeResult(
  slug: string,
  status: PageResult['status'],
  mismatchPercent = 0,
): PageResult {
  return {
    slug,
    mismatchPixels: mismatchPercent,
    mismatchPercent,
    status,
    sizeDiff: false,
    version: 1,
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

describe('getSlugBMap', () => {
  it('maps A slugs to their paired B slugs', () => {
    const run = makeRun({
      slugs: ['/about'],
      slugPairs: [{ a: '/about', b: '/preview/de/about' }],
    })
    expect(getSlugBMap(run).get('/about')).toBe('/preview/de/about')
  })

  it('returns an empty map for shared-slug and legacy runs', () => {
    expect(getSlugBMap(makeRun({})).size).toBe(0)
  })

  it('has no entry for an A slug not in slugPairs (callers fall back)', () => {
    const run = makeRun({
      slugPairs: [{ a: '/about', b: '/preview/de/about' }],
    })
    expect(getSlugBMap(run).get('/contact')).toBeUndefined()
  })

  it('keeps existing helpers returning A-slugs on a pair run', () => {
    const run = makeRun({
      slugs: ['/', '/about', '/contact'],
      slugPairs: [
        { a: '/', b: '/preview/de/' },
        { a: '/about', b: '/preview/de/about' },
        { a: '/contact', b: '/preview/de/contact' },
      ],
      results: [
        {
          slug: '/',
          mismatchPixels: 0,
          mismatchPercent: 0,
          status: 'error',
          sizeDiff: false,
          version: 1,
          error: 'boom',
        },
      ],
    })
    expect(getErrorSlugs(run)).toEqual(['/'])
    expect(getPendingSlugs(run)).toEqual(['/about', '/contact'])
  })
})

describe('sortResultSlugs', () => {
  it('sorts completed results by largest diff, followed by errors and pending', () => {
    const run = makeRun({
      slugs: ['/pending', '/low-b', '/error', '/high', '/match', '/low-a'],
      results: [
        makeResult('/low-b', 'diff', 2),
        makeResult('/error', 'error'),
        makeResult('/high', 'diff', 20),
        makeResult('/match', 'match'),
        makeResult('/low-a', 'diff', 2),
      ],
    })

    expect(sortResultSlugs(run, 'diff-desc')).toEqual([
      '/high',
      '/low-a',
      '/low-b',
      '/match',
      '/error',
      '/pending',
    ])
  })

  it('sorts every slug by name', () => {
    const run = makeRun({
      slugs: ['/zebra', '/about', '/pending', '/contact'],
      results: [
        makeResult('/zebra', 'diff', 10),
        makeResult('/about', 'error'),
        makeResult('/contact', 'match'),
      ],
    })

    expect(sortResultSlugs(run, 'name')).toEqual([
      '/about',
      '/contact',
      '/pending',
      '/zebra',
    ])
  })

  it('sorts errors, diffs, matches, and pending with slug tie-breakers', () => {
    const run = makeRun({
      slugs: [
        '/pending-b',
        '/match',
        '/diff-b',
        '/error-b',
        '/pending-a',
        '/diff-a',
        '/error-a',
      ],
      results: [
        makeResult('/match', 'match'),
        makeResult('/diff-b', 'diff', 20),
        makeResult('/error-b', 'error'),
        makeResult('/diff-a', 'diff', 10),
        makeResult('/error-a', 'error'),
      ],
    })

    expect(sortResultSlugs(run, 'status')).toEqual([
      '/error-a',
      '/error-b',
      '/diff-a',
      '/diff-b',
      '/match',
      '/pending-a',
      '/pending-b',
    ])
  })

  it('does not mutate the run and recomputes when a streamed result arrives', () => {
    const run = makeRun({
      // Input order deliberately differs from the sorted output so an
      // in-place sort of run.slugs would be caught below.
      slugs: ['/pending', '/existing'],
      results: [makeResult('/existing', 'diff', 5)],
    })

    expect(sortResultSlugs(run, 'diff-desc')).toEqual(['/existing', '/pending'])
    expect(run.slugs).toEqual(['/pending', '/existing'])
    expect(run.results).toEqual([makeResult('/existing', 'diff', 5)])

    const updatedRun = {
      ...run,
      results: [...run.results, makeResult('/pending', 'diff', 10)],
    }
    expect(sortResultSlugs(updatedRun, 'diff-desc')).toEqual([
      '/pending',
      '/existing',
    ])
  })

  it('breaks name ties with en-locale collation regardless of environment', () => {
    const run = makeRun({
      slugs: ['/z', '/é', '/a'],
      results: [],
    })
    expect(sortResultSlugs(run, 'name')).toEqual(['/a', '/é', '/z'])
  })

  it('sorts by the A-slug for pair runs, keyed independent of the B-slug', () => {
    const run = makeRun({
      slugs: ['/about', '/contact'],
      slugPairs: [
        { a: '/about', b: '/preview/de/zzz' },
        { a: '/contact', b: '/preview/de/aaa' },
      ],
      results: [
        makeResult('/about', 'diff', 5),
        makeResult('/contact', 'diff', 5),
      ],
    })
    expect(sortResultSlugs(run, 'name')).toEqual(['/about', '/contact'])
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
