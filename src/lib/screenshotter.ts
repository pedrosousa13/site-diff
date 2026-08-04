import { chromium, Browser, BrowserContext, Page } from 'playwright'
import type { ComparisonConfig } from './types'

export interface ScreenshotResult {
  statusCode: number | null
  excluded: boolean
  /** Click selectors that never appeared on this page. Absent when they all
   * matched. A miss costs CLICK_TIMEOUT_MS, so a typo is worth surfacing. */
  unmatchedClickSelectors?: string[]
}

/** How long to wait for a click selector to appear. Consent banners are
 * injected within ~500ms of the load event; a miss costs this much on every
 * page, on both sides, so keep the margin modest. */
export const CLICK_TIMEOUT_MS = 1500

let browser: Browser | null = null

/** Cookies and storage captured after a consent banner was dismissed, keyed by
 * origin. A context is created per screenshot, so without this every page
 * re-shows the banner and re-pays the click. Cleared with the browser so state
 * never leaks between runs. */
const consentState = new Map<string, StorageState>()
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      args: ['--ignore-certificate-errors'],
    })
  }
  return browser
}

export async function closeBrowser(): Promise<void> {
  consentState.clear()
  if (browser) {
    await browser.close()
    browser = null
  }
}

export async function takeScreenshot(
  url: string,
  outputPath: string,
  config: ComparisonConfig,
): Promise<ScreenshotResult> {
  const b = await getBrowser()
  const origin = originOf(url)
  const reusedConsent = origin ? consentState.has(origin) : false
  const context = await b.newContext({
    viewport: config.viewport,
    ignoreHTTPSErrors: true,
    storageState: origin ? consentState.get(origin) : undefined,
  })

  const page = await context.newPage()

  try {
    // Try original URL first, fall back to http if https fails
    let targetUrl = url
    let response
    try {
      response = await page.goto(targetUrl, {
        waitUntil: 'load',
        timeout: 30000,
      })
    } catch (err) {
      const isSSLError =
        err instanceof Error &&
        (err.message.includes('ERR_SSL') ||
          err.message.includes('SSL_PROTOCOL'))

      if (isSSLError && targetUrl.startsWith('https://')) {
        // Retry with http://
        targetUrl = targetUrl.replace('https://', 'http://')
        response = await page.goto(targetUrl, {
          waitUntil: 'load',
          timeout: 30000,
        })
      } else {
        throw err
      }
    }

    const statusCode = response?.status() ?? null
    if (
      shouldExcludeHttpResponse(statusCode, config.excludeHttpErrors ?? true)
    ) {
      return { statusCode, excluded: true }
    }

    // Dismiss consent banners / modals by clicking (e.g. OneTrust accept button).
    // Best-effort: the banner may not appear on every page or environment.
    const unmatched: string[] = []
    if (config.clickSelectors?.length) {
      let clicked = false
      for (const selector of config.clickSelectors) {
        try {
          await page.click(selector, { timeout: CLICK_TIMEOUT_MS })
          clicked = true
        } catch {
          // Selector not present — nothing to dismiss, continue. Carrying
          // consent over is exactly why the banner is absent on later pages, so
          // a miss there is expected rather than a mistake worth reporting.
          if (!reusedConsent) unmatched.push(selector)
        }
      }
      // Something was dismissed, so this context now holds the consent cookie.
      // Hand it to the next page of this origin so it skips the banner.
      if (clicked && origin) {
        consentState.set(origin, await context.storageState())
      }
    }

    if (config.hideSelectors?.length) {
      await hideElements(page, config.hideSelectors)
    }

    if (config.delay > 0) {
      await page.waitForTimeout(config.delay)
    }

    await page.screenshot({
      path: outputPath,
      fullPage: config.fullPage,
    })
    return {
      statusCode,
      excluded: false,
      ...(unmatched.length && { unmatchedClickSelectors: unmatched }),
    }
  } finally {
    await context.close()
  }
}

export function shouldExcludeHttpResponse(
  statusCode: number | null,
  excludeHttpErrors: boolean,
): boolean {
  return (
    excludeHttpErrors &&
    statusCode !== null &&
    statusCode >= 400 &&
    statusCode < 600
  )
}

/** Hides matching elements with a stylesheet rather than per-element inline
 * styles, for two reasons:
 *
 * - Consent banners (OneTrust) are injected after the load event, so a
 *   one-shot pass over the DOM present at load matches nothing. A stylesheet
 *   also covers elements added later.
 * - `display: none` removes the whole subtree. `visibility: hidden` only
 *   hides the element itself and is inherited, so descendants can override
 *   it — OneTrust's own reset sets `visibility: visible` on every div, span,
 *   heading, button and link inside its banner, which kept the banner's text
 *   and buttons on screen.
 *
 * One rule per selector, so a malformed selector only voids itself. */
async function hideElements(page: Page, selectors: string[]): Promise<void> {
  const content = selectors
    .map((sel) => `${sel} { display: none !important; }`)
    .join('\n')
  await page.addStyleTag({ content })
}
