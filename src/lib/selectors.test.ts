import { describe, it, expect } from 'vitest'
import { parseSelectorLines } from './selectors'

describe('parseSelectorLines', () => {
  it('splits lines, trims, and drops blanks', () => {
    expect(parseSelectorLines('#a\n  .b  \n\n .c\n')).toEqual([
      '#a',
      '.b',
      '.c',
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseSelectorLines('#a\r\n.b\r\n')).toEqual(['#a', '.b'])
  })

  it('returns an empty list for empty or whitespace-only text', () => {
    expect(parseSelectorLines('')).toEqual([])
    expect(parseSelectorLines('  \n \n')).toEqual([])
  })
})
