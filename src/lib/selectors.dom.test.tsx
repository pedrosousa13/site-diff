import { describe, it, expect } from 'vitest'
import { findInvalidSelector } from './selectors'

describe('findInvalidSelector', () => {
  it('returns null when every selector parses', () => {
    expect(findInvalidSelector(['#a', '.b > span', '[data-x="1"]'])).toBeNull()
  })

  it('returns the first invalid selector', () => {
    expect(findInvalidSelector(['#ok', ':::nope', 'p..q'])).toBe(':::nope')
  })

  it('returns null for an empty list', () => {
    expect(findInvalidSelector([])).toBeNull()
  })
})
