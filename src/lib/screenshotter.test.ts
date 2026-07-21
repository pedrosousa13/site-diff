import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from './types'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  goto: vi.fn(),
  screenshot: vi.fn(),
  closeContext: vi.fn(),
  closeBrowser: vi.fn(),
}))

vi.mock('playwright', () => ({
  chromium: { launch: mocks.launch },
}))

import {
  closeBrowser,
  shouldExcludeHttpResponse,
  takeScreenshot,
} from './screenshotter'

beforeEach(() => {
  mocks.launch.mockResolvedValue({
    newContext: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: mocks.goto,
        click: vi.fn(),
        evaluate: vi.fn(),
        waitForTimeout: vi.fn(),
        screenshot: mocks.screenshot,
      }),
      close: mocks.closeContext,
    }),
    close: mocks.closeBrowser,
  })
})

afterEach(async () => {
  await closeBrowser()
  vi.clearAllMocks()
})

describe('shouldExcludeHttpResponse', () => {
  it.each([
    [399, false],
    [400, true],
    [599, true],
    [600, false],
    [null, false],
  ])('classifies status %s as %s', (statusCode, expected) => {
    expect(shouldExcludeHttpResponse(statusCode, true)).toBe(expected)
  })

  it('keeps HTTP error responses when exclusion is disabled', () => {
    expect(shouldExcludeHttpResponse(404, false)).toBe(false)
  })

  it('returns an excluded response without capturing an HTTP error page', async () => {
    mocks.goto.mockResolvedValue({ status: () => 404 })

    await expect(
      takeScreenshot('https://example.com', '/tmp/unused.png', {
        ...DEFAULT_CONFIG,
        excludeHttpErrors: true,
      }),
    ).resolves.toEqual({ statusCode: 404, excluded: true })
    expect(mocks.screenshot).not.toHaveBeenCalled()
  })

  it('captures an HTTP error page when exclusion is disabled', async () => {
    mocks.goto.mockResolvedValue({ status: () => 500 })

    await expect(
      takeScreenshot('https://example.com', '/tmp/unused.png', {
        ...DEFAULT_CONFIG,
        excludeHttpErrors: false,
      }),
    ).resolves.toEqual({ statusCode: 500, excluded: false })
    expect(mocks.screenshot).toHaveBeenCalledOnce()
  })
})
