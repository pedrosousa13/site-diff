import { describe, it, expect } from 'vitest'
import { createMutex } from './runner'

describe('createMutex', () => {
  it('runs tasks one at a time in FIFO order', async () => {
    const mutex = createMutex()
    const events: string[] = []
    const task = (label: string, ms: number) =>
      mutex(async () => {
        events.push(`start:${label}`)
        await new Promise((r) => setTimeout(r, ms))
        events.push(`end:${label}`)
      })

    await Promise.all([task('a', 30), task('b', 5), task('c', 1)])

    expect(events).toEqual([
      'start:a',
      'end:a',
      'start:b',
      'end:b',
      'start:c',
      'end:c',
    ])
  })

  it('does not let a rejection break the chain', async () => {
    const mutex = createMutex()
    await expect(
      mutex(async () => {
        throw new Error('x')
      }),
    ).rejects.toThrow('x')
    await expect(mutex(async () => 42)).resolves.toBe(42)
  })
})
