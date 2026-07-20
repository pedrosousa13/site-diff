import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getMetadata, saveMetadata } from '@/lib/storage'
import type { ComparisonRun, PageResult } from '@/lib/types'
import { PATCH } from './route'

vi.mock('@/lib/storage', () => ({
  getMetadata: vi.fn(),
  saveMetadata: vi.fn(),
  deleteRun: vi.fn(),
}))

vi.mock('@/lib/runner', () => ({
  withRunLock: (_id: string, fn: () => Promise<unknown>) => fn(),
}))

function makeRun(result: PageResult): ComparisonRun {
  return {
    id: 'run-1',
    baseUrlA: 'https://a.example.com',
    baseUrlB: 'https://b.example.com',
    createdAt: '2026-07-20T00:00:00.000Z',
    config: {
      viewport: { width: 1280, height: 720 },
      fullPage: true,
      delay: 500,
      threshold: 0.1,
    },
    slugs: [result.slug],
    results: [result],
    status: 'completed',
  }
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/runs/run-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH review state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks a result viewed without changing checked', async () => {
    const run = makeRun({
      slug: '/',
      mismatchPixels: 10,
      mismatchPercent: 1,
      status: 'diff',
      sizeDiff: false,
      version: 1,
      checked: true,
    })
    vi.mocked(getMetadata).mockResolvedValue(run)

    const response = await PATCH(makeRequest({ slug: '/', viewed: true }), {
      params: Promise.resolve({ id: run.id }),
    })

    expect(response.status).toBe(200)
    expect(run.results[0]).toMatchObject({ viewed: true, checked: true })
    expect(saveMetadata).toHaveBeenCalledWith(run)
  })

  it('changes checked without changing viewed', async () => {
    const run = makeRun({
      slug: '/',
      mismatchPixels: 10,
      mismatchPercent: 1,
      status: 'diff',
      sizeDiff: false,
      version: 1,
      checked: true,
      viewed: true,
    })
    vi.mocked(getMetadata).mockResolvedValue(run)

    const response = await PATCH(makeRequest({ slug: '/', checked: false }), {
      params: Promise.resolve({ id: run.id }),
    })

    expect(response.status).toBe(200)
    expect(run.results[0]).toMatchObject({ viewed: true, checked: false })
    expect(saveMetadata).toHaveBeenCalledWith(run)
  })
})
