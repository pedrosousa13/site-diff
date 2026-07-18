import { describe, it, expect } from 'vitest'
import {
  getErrorSlugs,
  getPendingSlugs,
  getSlugB,
  parseShortId,
} from './runResults'
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

describe('getSlugB', () => {
  it('returns the paired B slug when slugPairs is present', () => {
    const run = makeRun({
      slugs: ['/about'],
      slugPairs: [{ a: '/about', b: '/preview/de/about' }],
    })
    expect(getSlugB(run, '/about')).toBe('/preview/de/about')
  })

  it('falls back to the A slug for shared-slug and legacy runs', () => {
    expect(getSlugB(makeRun({}), '/about')).toBe('/about')
  })

  it('falls back for an A slug not found in slugPairs', () => {
    const run = makeRun({
      slugPairs: [{ a: '/about', b: '/preview/de/about' }],
    })
    expect(getSlugB(run, '/contact')).toBe('/contact')
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

describe('parseShortId', () => {
  it('strips a leading date prefix', () => {
    expect(parseShortId('2026-06-25-abc123')).toBe('abc123')
  })

  it('returns the id unchanged when there is no date prefix', () => {
    expect(parseShortId('legacy-id')).toBe('legacy-id')
  })
})
