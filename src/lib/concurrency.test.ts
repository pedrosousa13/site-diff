import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from './concurrency'

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40])
  })

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 10 }, (_, i) => i)
    await mapWithConcurrency(items, 3, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return n
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('processes every item', async () => {
    const seen: number[] = []
    await mapWithConcurrency([5, 6, 7], 2, async (n) => {
      seen.push(n)
      return n
    })
    expect(seen.sort()).toEqual([5, 6, 7])
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 3, async (n) => n)).toEqual([])
  })

  it('handles limit larger than item count', async () => {
    expect(await mapWithConcurrency([1, 2], 10, async (n) => n)).toEqual([1, 2])
  })
})
