import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveMetadata } from '@/lib/storage'
import { POST } from './route'

vi.mock('nanoid', () => ({ nanoid: () => 'test-id' }))
vi.mock('@/lib/storage', () => ({
  ensureRunDir: vi.fn(),
  saveMetadata: vi.fn(),
}))
vi.mock('@/lib/runner', () => ({ startRun: vi.fn() }))

const validBody = {
  baseUrlA: 'https://a.example',
  baseUrlB: 'https://b.example',
  slugs: ['/'],
}

function request(config?: unknown): NextRequest {
  const body = config === undefined ? validBody : { ...validBody, config }
  return { json: async () => body } as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/compare thresholds', () => {
  it('keeps the existing defaults when thresholds are omitted', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(saveMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          threshold: 0.1,
          matchPercentCutoff: 0.05,
        }),
      }),
    )
  })

  it.each([
    [0.25, 1.5],
    [0, 0],
    [1, 100],
  ])(
    'stores valid threshold overrides %s and %s',
    async (threshold, matchPercentCutoff) => {
      const response = await POST(request({ threshold, matchPercentCutoff }))

      expect(response.status).toBe(200)
      expect(saveMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            threshold,
            matchPercentCutoff,
          }),
        }),
      )
    },
  )

  it.each([
    ['threshold', '0.1'],
    ['threshold', Number.NaN],
    ['threshold', -0.01],
    ['threshold', 1.01],
    ['matchPercentCutoff', '0.05'],
    ['matchPercentCutoff', Number.POSITIVE_INFINITY],
    ['matchPercentCutoff', -0.01],
    ['matchPercentCutoff', 100.01],
  ])('rejects invalid %s value %s', async (field, value) => {
    const response = await POST(request({ [field]: value }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: expect.stringContaining(field),
    })
    expect(saveMetadata).not.toHaveBeenCalled()
  })
})
