import { describe, it, expect } from 'vitest'
import {
  mergeSlugs,
  zipSlugPairs,
  validateSlugPairs,
  validateSlugs,
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
    expect(validateSlugs([]).ok).toBe(false)
  })

  it('rejects blank or non-string entries', () => {
    expect(validateSlugs(['/a', '  ']).ok).toBe(false)
    expect(validateSlugs(['/a', 42]).ok).toBe(false)
    expect(validateSlugs(['/a', null]).ok).toBe(false)
  })
})
