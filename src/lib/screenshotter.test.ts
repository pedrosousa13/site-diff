import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from './types'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  goto: vi.fn(),
  screenshot: vi.fn(),
  addStyleTag: vi.fn(),
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
        addStyleTag: mocks.addStyleTag,
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

describe('hideSelectors', () => {
  beforeEach(() => {
    mocks.goto.mockResolvedValue({ status: () => 200 })
  })

  // Banners like OneTrust are injected after the load event, so hiding has to
  // be a stylesheet rule that also catches elements added later — not a
  // one-shot pass over the elements present right after load.
  it('hides via a stylesheet so late-injected elements are covered', async () => {
    await takeScreenshot('https://example.com', '/tmp/unused.png', {
      ...DEFAULT_CONFIG,
      hideSelectors: ['#onetrust-consent-sdk'],
    })

    const css = mocks.addStyleTag.mock.calls
      .map(([arg]) => arg.content)
      .join('')
    expect(css).toContain('#onetrust-consent-sdk')
  })

  // `visibility: hidden` is inherited and overridable: OneTrust's reset sets
  // `visibility: visible` on every element inside its banner, so the text and
  // buttons stayed on screen. `display: none` drops the whole subtree.
  it('removes the subtree with display: none, not visibility', async () => {
    await takeScreenshot('https://example.com', '/tmp/unused.png', {
      ...DEFAULT_CONFIG,
      hideSelectors: ['#onetrust-consent-sdk'],
    })

    const css = mocks.addStyleTag.mock.calls
      .map(([arg]) => arg.content)
      .join('')
    expect(css).toContain('display: none !important')
    expect(css).not.toContain('visibility')
  })

  it('emits one rule per selector so a bad selector cannot void the others', async () => {
    await takeScreenshot('https://example.com', '/tmp/unused.png', {
      ...DEFAULT_CONFIG,
      hideSelectors: ['.a', '.b'],
    })

    const css = mocks.addStyleTag.mock.calls
      .map(([arg]) => arg.content)
      .join('')
    expect(css).toContain('.a {')
    expect(css).toContain('.b {')
  })

  it('injects nothing when no selectors are configured', async () => {
    await takeScreenshot('https://example.com', '/tmp/unused.png', {
      ...DEFAULT_CONFIG,
    })

    expect(mocks.addStyleTag).not.toHaveBeenCalled()
  })
})
