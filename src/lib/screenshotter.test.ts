import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from './types'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  goto: vi.fn(),
  screenshot: vi.fn(),
  addStyleTag: vi.fn(),
  click: vi.fn(),
  newContext: vi.fn(),
  storageState: vi.fn(),
  closeContext: vi.fn(),
  closeBrowser: vi.fn(),
}))

vi.mock('playwright', () => ({
  chromium: { launch: mocks.launch },
}))

import {
  CLICK_TIMEOUT_MS,
  closeBrowser,
  shouldExcludeHttpResponse,
  takeScreenshot,
} from './screenshotter'

beforeEach(() => {
  mocks.storageState.mockResolvedValue({ cookies: [], origins: [] })
  mocks.newContext.mockImplementation(async () => ({
    newPage: vi.fn().mockResolvedValue({
      goto: mocks.goto,
      click: mocks.click,
      evaluate: vi.fn(),
      addStyleTag: mocks.addStyleTag,
      waitForTimeout: vi.fn(),
      screenshot: mocks.screenshot,
    }),
    storageState: mocks.storageState,
    close: mocks.closeContext,
  }))
  mocks.launch.mockResolvedValue({
    newContext: mocks.newContext,
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

describe('clickSelectors', () => {
  beforeEach(() => {
    mocks.goto.mockResolvedValue({ status: () => 200 })
  })

  // A missing selector costs the full timeout on every page, on both sides, so
  // the wait has to stay tight. Banners show up ~500ms after load.
  it('waits no longer than the click timeout for each selector', async () => {
    await takeScreenshot('https://example.com', '/tmp/unused.png', {
      ...DEFAULT_CONFIG,
      clickSelectors: ['#accept'],
    })

    expect(CLICK_TIMEOUT_MS).toBeLessThanOrEqual(1500)
    expect(mocks.click).toHaveBeenCalledWith('#accept', {
      timeout: CLICK_TIMEOUT_MS,
    })
  })

  // Silently swallowing a miss hides typos that cost the timeout per page.
  it('reports selectors that never matched', async () => {
    mocks.click.mockImplementation(async (sel: string) => {
      if (sel === '#typo') throw new Error('timeout')
    })

    const result = await takeScreenshot(
      'https://example.com',
      '/tmp/unused.png',
      { ...DEFAULT_CONFIG, clickSelectors: ['#accept', '#typo'] },
    )

    expect(result.unmatchedClickSelectors).toEqual(['#typo'])
  })

  it('reports nothing when every selector matched', async () => {
    const result = await takeScreenshot(
      'https://example.com',
      '/tmp/unused.png',
      { ...DEFAULT_CONFIG, clickSelectors: ['#accept'] },
    )

    expect(result.unmatchedClickSelectors).toBeUndefined()
  })

  // Each screenshot gets a fresh context, so the consent cookie died with it and
  // every page re-showed the banner. Carry the accepted state to later pages.
  it('reuses consent state across pages of the same origin', async () => {
    const state = { cookies: [{ name: 'OptanonAlertBoxClosed' }], origins: [] }
    mocks.storageState.mockResolvedValue(state)

    const config = { ...DEFAULT_CONFIG, clickSelectors: ['#accept'] }
    await takeScreenshot('https://example.com/one', '/tmp/a.png', config)
    await takeScreenshot('https://example.com/two', '/tmp/b.png', config)

    expect(mocks.newContext.mock.calls[0][0].storageState).toBeUndefined()
    expect(mocks.newContext.mock.calls[1][0].storageState).toBe(state)
  })

  // Once consent carries over, the accept button is legitimately absent on
  // every later page. Reporting it would turn the fix working into a warning.
  it('stops reporting misses once consent has carried over', async () => {
    mocks.click.mockImplementation(async () => {
      // Matches on the first page only, as a real accept button would.
      if (mocks.newContext.mock.calls.length > 1) throw new Error('timeout')
    })

    const config = { ...DEFAULT_CONFIG, clickSelectors: ['#accept'] }
    await takeScreenshot('https://example.com/one', '/tmp/a.png', config)
    const second = await takeScreenshot(
      'https://example.com/two',
      '/tmp/b.png',
      config,
    )

    expect(second.unmatchedClickSelectors).toBeUndefined()
  })

  it('keeps consent state per origin', async () => {
    const config = { ...DEFAULT_CONFIG, clickSelectors: ['#accept'] }
    await takeScreenshot('https://a.example.com/', '/tmp/a.png', config)
    await takeScreenshot('https://b.example.com/', '/tmp/b.png', config)

    expect(mocks.newContext.mock.calls[1][0].storageState).toBeUndefined()
  })

  it('does not carry state over when no selector matched', async () => {
    mocks.click.mockRejectedValue(new Error('timeout'))

    const config = { ...DEFAULT_CONFIG, clickSelectors: ['#typo'] }
    await takeScreenshot('https://example.com/one', '/tmp/a.png', config)
    await takeScreenshot('https://example.com/two', '/tmp/b.png', config)

    expect(mocks.newContext.mock.calls[1][0].storageState).toBeUndefined()
  })

  it('drops consent state when the browser closes, so runs stay isolated', async () => {
    const config = { ...DEFAULT_CONFIG, clickSelectors: ['#accept'] }
    await takeScreenshot('https://example.com/one', '/tmp/a.png', config)
    await closeBrowser()
    await takeScreenshot('https://example.com/two', '/tmp/b.png', config)

    expect(mocks.newContext.mock.calls[1][0].storageState).toBeUndefined()
  })

  it('never captures state when no click selectors are configured', async () => {
    await takeScreenshot('https://example.com/', '/tmp/a.png', DEFAULT_CONFIG)

    expect(mocks.storageState).not.toHaveBeenCalled()
  })
})
