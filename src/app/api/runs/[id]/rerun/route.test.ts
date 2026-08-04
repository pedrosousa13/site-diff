import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ComparisonRun } from '@/lib/types'

const mocks = vi.hoisted(() => ({
  getMetadata: vi.fn(),
  saveMetadata: vi.fn(),
  startRun: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  getMetadata: mocks.getMetadata,
  saveMetadata: mocks.saveMetadata,
}))

vi.mock('@/lib/runner', () => ({
  startRun: mocks.startRun,
  withRunLock: (_id: string, fn: () => Promise<unknown>) => fn(),
}))

import { POST } from './route'

function makeRun(overrides: Partial<ComparisonRun> = {}): ComparisonRun {
  return {
    id: 'run-1',
    baseUrlA: 'https://a.example.com',
    baseUrlB: 'https://b.example.com',
    createdAt: '2026-08-04T00:00:00.000Z',
    config: {
      viewport: { width: 1280, height: 720 },
      fullPage: true,
      delay: 500,
      threshold: 0.1,
      matchPercentCutoff: 0.05,
    },
    slugs: ['/pricing', '/about'],
    results: [
      {
        slug: '/pricing',
        mismatchPixels: 0,
        mismatchPercent: 0,
        status: 'error',
        sizeDiff: false,
        version: 1,
      },
    ],
    status: 'completed',
    concurrency: 3,
    ...overrides,
  }
}

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/runs/run-1/rerun', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'run-1' }) },
  )
}

/** The run as it was written back to disk. */
function saved(): ComparisonRun {
  const call = mocks.saveMetadata.mock.calls.at(-1)
  if (!call) throw new Error('saveMetadata was never called')
  return call[0] as ComparisonRun
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMetadata.mockResolvedValue(makeRun())
})

describe('rerun route', () => {
  it('re-runs the requested slugs and leaves the config alone', async () => {
    const response = await post({ slugs: ['/about'] })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'run-1', slugs: ['/about'] })
    expect(saved().config).toEqual(makeRun().config)
    expect(mocks.startRun).toHaveBeenCalledWith(expect.anything(), ['/about'])
  })

  it('falls back to the error slugs when none are requested', async () => {
    await post({})

    expect(mocks.startRun).toHaveBeenCalledWith(expect.anything(), ['/pricing'])
  })

  it('stores an edited config and re-runs every slug', async () => {
    const response = await post({
      slugs: ['/pricing', '/about'],
      config: {
        viewport: { width: 375, height: 812 },
        delay: 1000,
        threshold: 0.2,
        matchPercentCutoff: 1,
        hideSelectors: ['#onetrust-consent-sdk'],
      },
      concurrency: 5,
    })

    expect(response.status).toBe(200)
    const run = saved()
    expect(run.config.viewport).toEqual({ width: 375, height: 812 })
    expect(run.config.delay).toBe(1000)
    expect(run.config.hideSelectors).toEqual(['#onetrust-consent-sdk'])
    expect(run.concurrency).toBe(5)
    expect(run.status).toBe('running')
  })

  // startRun reads config off the run it is handed, so an edited config that is
  // only written to disk would be ignored by the screenshots it triggers.
  it('hands the edited config to the run it starts', async () => {
    await post({
      slugs: ['/about'],
      config: { hideSelectors: ['#onetrust-consent-sdk'] },
    })

    const started = mocks.startRun.mock.calls[0][0] as ComparisonRun
    expect(started.config.hideSelectors).toEqual(['#onetrust-consent-sdk'])
  })

  it('rejects an invalid config without touching the run', async () => {
    const response = await post({ slugs: ['/about'], config: { threshold: 5 } })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('threshold')
    expect(mocks.saveMetadata).not.toHaveBeenCalled()
    expect(mocks.startRun).not.toHaveBeenCalled()
  })

  it('keeps the stored concurrency when none is supplied', async () => {
    await post({ slugs: ['/about'], config: { threshold: 0.2 } })

    expect(saved().concurrency).toBe(3)
  })

  it('404s for an unknown run', async () => {
    mocks.getMetadata.mockResolvedValue(null)

    expect((await post({ slugs: ['/about'] })).status).toBe(404)
  })

  it('400s when no requested slug belongs to the run', async () => {
    const response = await post({ slugs: ['/nope'] })

    expect(response.status).toBe(400)
    expect(mocks.startRun).not.toHaveBeenCalled()
  })
})
