import { describe, it, expect } from 'vitest'
import { parseMatchPercentCutoff } from './cutoffInput'

describe('parseMatchPercentCutoff', () => {
  it('parses a plain number', () => {
    expect(parseMatchPercentCutoff('0.05')).toBe(0.05)
  })

  it('parses zero', () => {
    expect(parseMatchPercentCutoff('0')).toBe(0)
  })

  it('returns null for an empty or whitespace field instead of coercing to 0', () => {
    expect(parseMatchPercentCutoff('')).toBeNull()
    expect(parseMatchPercentCutoff('   ')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(parseMatchPercentCutoff('abc')).toBeNull()
  })

  it('returns null outside 0–100', () => {
    expect(parseMatchPercentCutoff('-1')).toBeNull()
    expect(parseMatchPercentCutoff('101')).toBeNull()
  })
})
