import { describe, it, expect } from 'vitest'
import {
  validateSlugPairs,
  validateSlugs,
  parseSlugLines,
  mergeSlugPairs,
} from './slugs'

describe('validateSlugPairs', () => {
  it('accepts valid pairs and trims slugs', () => {
    expect(validateSlugPairs([{ a: ' /a ', b: '/x' }])).toEqual({
      ok: true,
      pairs: [{ a: '/a', b: '/x' }],
    })
  })

  it('rejects non-arrays and empty arrays', () => {
    expect(validateSlugPairs(undefined).ok).toBe(false)
    expect(validateSlugPairs('nope').ok).toBe(false)
    expect(validateSlugPairs([]).ok).toBe(false)
  })

  it('rejects entries with a missing or blank side', () => {
    expect(validateSlugPairs([{ a: '/a' }]).ok).toBe(false)
    expect(validateSlugPairs([{ a: '/a', b: '  ' }]).ok).toBe(false)
    expect(validateSlugPairs([null]).ok).toBe(false)
  })

  it('rejects duplicate A-slugs', () => {
    expect(
      validateSlugPairs([
        { a: '/a', b: '/x' },
        { a: '/a', b: '/y' },
      ]).ok,
    ).toBe(false)
  })

  it('rejects absolute URLs on either side', () => {
    expect(validateSlugPairs([{ a: 'https://x.com/a', b: '/b' }]).ok).toBe(
      false,
    )
    expect(validateSlugPairs([{ a: '/a', b: 'http://x.com/b' }]).ok).toBe(false)
  })
})

describe('parseSlugLines', () => {
  it('treats plain lines as shared slugs', () => {
    expect(parseSlugLines('/\n/about')).toEqual({
      pairs: [
        { a: '/', b: '/' },
        { a: '/about', b: '/about' },
      ],
      errors: [],
    })
  })

  it('parses arrow lines into pairs and trims both sides', () => {
    expect(parseSlugLines('/de/uber-uns ->  /en/about-us ')).toEqual({
      pairs: [{ a: '/de/uber-uns', b: '/en/about-us' }],
      errors: [],
    })
  })

  it('mixes shared and paired lines', () => {
    expect(parseSlugLines('/\n/about -> /about-us').pairs).toEqual([
      { a: '/', b: '/' },
      { a: '/about', b: '/about-us' },
    ])
  })

  it('skips blank lines without shifting pairing or line numbers', () => {
    const result = parseSlugLines('/a\n\n/b -> \n/c')
    expect(result.pairs).toEqual([
      { a: '/a', b: '/a' },
      { a: '/c', b: '/c' },
    ])
    expect(result.errors).toEqual([
      { line: 3, message: expect.stringContaining('after "->"') },
    ])
  })

  it('errors on a missing side of an arrow', () => {
    expect(parseSlugLines('-> /b').errors).toEqual([
      { line: 1, message: expect.stringContaining('before "->"') },
    ])
  })

  it('errors on more than one arrow in a line', () => {
    const { pairs, errors } = parseSlugLines('/a -> /b -> /c')
    expect(pairs).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(1)
  })

  it('errors on absolute URLs on either side', () => {
    expect(parseSlugLines('https://x.com/a').errors).toHaveLength(1)
    expect(parseSlugLines('/a -> http://x.com/b').errors).toHaveLength(1)
  })

  it('errors on duplicate A-slugs, keeping the first pair', () => {
    const { pairs, errors } = parseSlugLines('/a -> /x\n/a -> /y')
    expect(pairs).toEqual([{ a: '/a', b: '/x' }])
    expect(errors).toEqual([
      { line: 2, message: expect.stringContaining('"/a"') },
    ])
  })

  it('returns empty pairs and no errors for empty input', () => {
    expect(parseSlugLines('')).toEqual({ pairs: [], errors: [] })
    expect(parseSlugLines('\n  \n')).toEqual({ pairs: [], errors: [] })
  })

  it('collects multiple errors with correct line numbers', () => {
    const { errors } = parseSlugLines('/a\n-> /b\n/c ->')
    expect(errors.map((e) => e.line)).toEqual([2, 3])
  })
})

describe('mergeSlugPairs', () => {
  const shared = (s: string) => ({ a: s, b: s })

  it('unions selected slugs (as shared pairs) with typed pairs', () => {
    expect(mergeSlugPairs(['/a'], [{ a: '/b', b: '/x' }])).toEqual([
      shared('/a'),
      { a: '/b', b: '/x' },
    ])
  })

  it('lets a typed mapping override a selected shared slug in place', () => {
    expect(
      mergeSlugPairs(['/a', '/b'], [{ a: '/a', b: '/staging-a' }]),
    ).toEqual([{ a: '/a', b: '/staging-a' }, shared('/b')])
  })

  it('dedupes selected slugs and trims them', () => {
    expect(mergeSlugPairs([' /a ', '/a'], [])).toEqual([shared('/a')])
  })

  it('handles empty selection (typed only)', () => {
    expect(mergeSlugPairs([], [shared('/x')])).toEqual([shared('/x')])
  })

  it('handles empty typed pairs (selection only)', () => {
    expect(mergeSlugPairs(['/x'], [])).toEqual([shared('/x')])
  })
})

describe('validateSlugs', () => {
  it('accepts valid slugs, trims, and dedups', () => {
    expect(validateSlugs([' /a ', '/b', '/a'])).toEqual({
      ok: true,
      slugs: ['/a', '/b'],
    })
  })

  it('rejects non-arrays and empty arrays', () => {
    expect(validateSlugs(undefined).ok).toBe(false)
    expect(validateSlugs('nope').ok).toBe(false)
    expect(validateSlugs({ 0: '/a' }).ok).toBe(false)
    expect(validateSlugs([]).ok).toBe(false)
  })

  it('rejects blank or non-string entries with their index', () => {
    const blank = validateSlugs(['/a', '  '])
    expect(blank.ok).toBe(false)
    if (!blank.ok) expect(blank.error).toContain('slugs[1]')
    expect(validateSlugs(['/a', 42]).ok).toBe(false)
    expect(validateSlugs(['/a', null]).ok).toBe(false)
  })

  it('rejects absolute URLs', () => {
    expect(validateSlugs(['https://x.com/a']).ok).toBe(false)
    expect(validateSlugs(['/a', 'http://x.com/b']).ok).toBe(false)
  })
})
