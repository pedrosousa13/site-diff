import { describe, expect, it, vi } from 'vitest'
import { getResultColumnCount } from './ResultsGrid'

vi.mock('@/lib/runResults', () => ({
  getErrorSlugs: vi.fn(),
  getPendingSlugs: vi.fn(),
  getSlugBMap: vi.fn(),
  sortResultSlugs: vi.fn(),
}))

vi.mock('./DiffViewer', () => ({ default: () => null }))

describe('getResultColumnCount', () => {
  it('uses two columns below the medium breakpoint', () => {
    expect(getResultColumnCount(320)).toBe(2)
    expect(getResultColumnCount(767)).toBe(2)
  })

  it('uses three columns from the medium breakpoint', () => {
    expect(getResultColumnCount(768)).toBe(3)
    expect(getResultColumnCount(1023)).toBe(3)
  })

  it('uses four columns from the large breakpoint', () => {
    expect(getResultColumnCount(1024)).toBe(4)
    expect(getResultColumnCount(1440)).toBe(4)
  })
})
