import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, __resetInFlightForTests } from './route'
import { getMetadata } from '@/lib/storage'
import { diffImagesToBuffer } from '@/lib/differ'
import type { ComparisonRun } from '@/lib/types'

vi.mock('@/lib/storage', () => ({
  getMetadata: vi.fn(),
  getScreenshotPath: vi.fn(() => '/tmp/shot.png'),
  isSafeRunId: vi.fn(() => true),
}))

vi.mock('@/lib/differ', () => ({
  diffImagesToBuffer: vi.fn(),
}))

function makeRun(partial: Partial<ComparisonRun> = {}): ComparisonRun {
  return {
    id: 'run-1',
    baseUrlA: 'https://a',
    baseUrlB: 'https://b',
    createdAt: '2026-07-20T00:00:00.000Z',
    config: {
      viewport: { width: 1280, height: 720 },
      fullPage: true,
      delay: 0,
      threshold: 0.1,
      matchPercentCutoff: 0.05,
    },
    slugs: ['/'],
    results: [],
    status: 'completed',
    ...partial,
  }
}

function post() {
  return POST(
    new NextRequest('http://localhost/api/runs/run-1/rediff', {
      method: 'POST',
      body: JSON.stringify({ slug: '/', threshold: 0.2 }),
    }),
    { params: Promise.resolve({ id: 'run-1' }) },
  )
}

beforeEach(() => {
  vi.mocked(getMetadata).mockReset()
  vi.mocked(diffImagesToBuffer).mockReset()
  __resetInFlightForTests()
})

describe('POST /api/runs/[id]/rediff gates', () => {
  it('returns 409 while the run is still in progress', async () => {
    vi.mocked(getMetadata).mockResolvedValue(makeRun({ status: 'running' }))

    const response = await post()

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Run is still in progress' })
    expect(diffImagesToBuffer).not.toHaveBeenCalled()
  })

  it('returns 429 once the in-flight cap is reached, then recovers', async () => {
    vi.mocked(getMetadata).mockResolvedValue(makeRun())
    const resolvers: Array<() => void> = []
    vi.mocked(diffImagesToBuffer).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve({
              buffer: Buffer.from('png'),
              mismatchPixels: 0,
              mismatchPercent: 0,
              sizeDiff: false,
            }),
          )
        }),
    )

    const first = post()
    const second = post()
    // Let both requests reach the diff stage.
    await vi.waitFor(() => expect(diffImagesToBuffer).toHaveBeenCalledTimes(2))

    const third = await post()
    expect(third.status).toBe(429)

    resolvers.forEach((r) => r())
    const [r1, r2] = await Promise.all([first, second])
    expect([r1.status, r2.status]).toEqual([200, 200])

    // Capacity is freed once requests finish.
    vi.mocked(diffImagesToBuffer).mockResolvedValue({
      buffer: Buffer.from('png'),
      mismatchPixels: 0,
      mismatchPercent: 0,
      sizeDiff: false,
    })
    const fourth = await post()
    expect(fourth.status).toBe(200)
  })
})
