import { describe, it, expect } from 'vitest'
import {
  mergeSlugs,
  zipSlugPairs,
  validateSlugPairs,
  parseSlugLines,
  mergeSlugPairs,
} from './slugs'

describe('mergeSlugs', () => {
  it('unions checked slugs with manual lines', () => {
    expect(mergeSlugs(['/a', '/b'], '/c\n/d')).toEqual(['/a', '/b', '/c', '/d'])
  })

  it('dedups across both sources', () => {
    expect(mergeSlugs(['/a', '/b'], '/b\n/c')).toEqual(['/a', '/b', '/c'])
  })

  it('trims whitespace and drops empty lines', () => {
    expect(mergeSlugs([' /a '], '  \n /b \n\n')).toEqual(['/a', '/b'])
  })

  it('handles no selection (manual only)', () => {
    expect(mergeSlugs([], '/x\n/y')).toEqual(['/x', '/y'])
  })

  it('handles no manual text (selection only)', () => {
    expect(mergeSlugs(['/x', '/y'], '')).toEqual(['/x', '/y'])
  })

  it('dedups repeats within a single source', () => {
    expect(mergeSlugs(['/a', '/a'], '/b\n/b')).toEqual(['/a', '/b'])
  })
})

describe('zipSlugPairs', () => {
  it('pairs lines by number', () => {
    expect(zipSlugPairs('/a\n/b', '/x\n/y')).toEqual({
      ok: true,
      pairs: [
        { a: '/a', b: '/x' },
        { a: '/b', b: '/y' },
      ],
    })
  })

  it('trims whitespace on both sides', () => {
    expect(zipSlugPairs(' /a ', '  /x')).toEqual({
      ok: true,
      pairs: [{ a: '/a', b: '/x' }],
    })
  })

  it('ignores trailing blank lines on either side', () => {
    expect(zipSlugPairs('/a\n\n', '/x')).toEqual({
      ok: true,
      pairs: [{ a: '/a', b: '/x' }],
    })
  })

  it('skips interior lines blank on both sides', () => {
    expect(zipSlugPairs('/a\n\n/b', '/x\n\n/y')).toEqual({
      ok: true,
      pairs: [
        { a: '/a', b: '/x' },
        { a: '/b', b: '/y' },
      ],
    })
  })

  it('errors when a line is blank on only one side', () => {
    const result = zipSlugPairs('/a\n\n/b', '/x\n/y\n/z')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Line 2')
  })

  it('errors on line-count mismatch', () => {
    const result = zipSlugPairs('/a\n/b\n/c', '/x\n/y')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('3 slugs')
  })

  it('errors on a duplicate A-slug', () => {
    const result = zipSlugPairs('/a\n/a', '/x\n/y')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('"/a"')
  })

  it('errors when both textareas are empty', () => {
    expect(zipSlugPairs('', '\n\n').ok).toBe(false)
  })
})

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
