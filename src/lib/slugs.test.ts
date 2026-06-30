import { describe, it, expect } from 'vitest'
import { mergeSlugs } from './slugs'

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
