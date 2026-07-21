import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compareSlug } from './runner'
import { takeScreenshot } from './screenshotter'
import { diffImages } from './differ'
import type { ComparisonRun } from './types'

vi.mock('./screenshotter', () => ({
  takeScreenshot: vi.fn(),
  closeBrowser: vi.fn(),
}))

vi.mock('./differ', () => ({
  diffImages: vi.fn(),
  determineStatus: vi.fn(() => 'match'),
}))

vi.mock('./storage', () => ({
  getMetadata: vi.fn(),
  saveMetadata: vi.fn(),
  getDiffPath: vi.fn(() => '/tmp/diff.png'),
  getScreenshotPath: vi.fn(() => '/tmp/shot.png'),
}))

function makeRun(): ComparisonRun {
  return {
    id: 'run-1',
    baseUrlA: 'https://a.example.com',
    baseUrlB: 'https://b.example.com',
    createdAt: '2026-07-20T00:00:00.000Z',
    config: {
      viewport: { width: 1280, height: 720 },
      fullPage: true,
      delay: 0,
      threshold: 0.1,
      matchPercentCutoff: 0.05,
    },
    slugs: ['/pricing'],
    results: [],
    status: 'running',
  }
}

const noSlugBMap = new Map<string, string>()

beforeEach(() => {
  vi.mocked(takeScreenshot).mockReset()
  vi.mocked(diffImages).mockReset()
})

describe('compareSlug HTTP error contract', () => {
  it('reports both sides when A and B are excluded', async () => {
    vi.mocked(takeScreenshot).mockImplementation(async (url) =>
      url.startsWith('https://a.')
        ? { statusCode: 404, excluded: true }
        : { statusCode: 500, excluded: true },
    )

    const result = await compareSlug(makeRun(), '/pricing', 1, noSlugBMap)

    expect(result.status).toBe('error')
    expect(result.error).toBe('A returned HTTP 404; B returned HTTP 500')
    expect(result.statusCodeA).toBe(404)
    expect(result.statusCodeB).toBe(500)
    expect(diffImages).not.toHaveBeenCalled()
  })

  it('reports only the excluded side when the other side is fine', async () => {
    vi.mocked(takeScreenshot).mockImplementation(async (url) =>
      url.startsWith('https://a.')
        ? { statusCode: 200, excluded: false }
        : { statusCode: 500, excluded: true },
    )

    const result = await compareSlug(makeRun(), '/pricing', 1, noSlugBMap)

    expect(result.status).toBe('error')
    expect(result.error).toBe('B returned HTTP 500')
    expect(result.statusCodeA).toBeUndefined()
    expect(result.statusCodeB).toBe(500)
  })

  it("keeps B's known status when A's screenshot rejects", async () => {
    vi.mocked(takeScreenshot).mockImplementation(async (url) => {
      if (url.startsWith('https://a.')) throw new Error('timeout after 30s')
      return { statusCode: 500, excluded: true }
    })

    const result = await compareSlug(makeRun(), '/pricing', 1, noSlugBMap)

    expect(result.status).toBe('error')
    expect(result.error).toBe(
      'A failed: timeout after 30s; B returned HTTP 500',
    )
    expect(result.statusCodeB).toBe(500)
  })
})
