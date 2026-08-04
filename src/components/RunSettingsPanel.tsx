'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { findInvalidSelector, parseSelectorLines } from '@/lib/selectors'
import { getAllSlugs } from '@/lib/runResults'
import { MAX_CONCURRENCY } from '@/lib/types'
import type { ComparisonRun } from '@/lib/types'

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'

/**
 * Edit the settings a run was captured with and re-run every page under them.
 *
 * The run is overwritten rather than forked: screenshots are replaced in place,
 * so keeping the old config would leave meta.json describing results that no
 * longer exist. Changing anything therefore re-runs the full slug list, not a
 * subset, so the stored config always matches every result.
 */
export default function RunSettingsPanel({ run }: { run: ComparisonRun }) {
  const router = useRouter()
  const slugs = getAllSlugs(run)

  const [width, setWidth] = useState(String(run.config.viewport.width))
  const [height, setHeight] = useState(String(run.config.viewport.height))
  const [fullPage, setFullPage] = useState(run.config.fullPage)
  const [delay, setDelay] = useState(String(run.config.delay))
  const [threshold, setThreshold] = useState(String(run.config.threshold))
  const [cutoff, setCutoff] = useState(String(run.config.matchPercentCutoff))
  const [excludeHttpErrors, setExcludeHttpErrors] = useState(
    run.config.excludeHttpErrors ?? true,
  )
  const [hideText, setHideText] = useState(
    (run.config.hideSelectors ?? []).join('\n'),
  )
  const [clickText, setClickText] = useState(
    (run.config.clickSelectors ?? []).join('\n'),
  )
  const [concurrency, setConcurrency] = useState(run.concurrency ?? 3)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const rerun = async () => {
    setError(null)

    const hideSelectors = parseSelectorLines(hideText)
    const clickSelectors = parseSelectorLines(clickText)
    const invalid = findInvalidSelector([...hideSelectors, ...clickSelectors])
    if (invalid) {
      setError(`Invalid CSS selector: "${invalid}"`)
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/runs/${run.id}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slugs,
          concurrency,
          config: {
            viewport: { width: Number(width), height: Number(height) },
            fullPage,
            delay: Number(delay),
            threshold: Number(threshold),
            matchPercentCutoff: Number(cutoff),
            excludeHttpErrors,
            hideSelectors,
            clickSelectors,
          },
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error ?? 'Could not start the re-run')
        return
      }
      // The page is a server component, so the new config and the reset results
      // only show up after a refetch.
      router.refresh()
    } catch {
      setError('Could not reach the server')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <details className="mb-6 border border-gray-200 rounded-md">
      <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer">
        Settings
      </summary>

      <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="rs-width"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Viewport width
            </label>
            <input
              id="rs-width"
              type="number"
              min={1}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="rs-height"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Viewport height
            </label>
            <input
              id="rs-height"
              type="number"
              min={1}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="rs-delay"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Delay (ms)
            </label>
            <input
              id="rs-delay"
              type="number"
              min={0}
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="rs-threshold"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Per-pixel threshold
            </label>
            <input
              id="rs-threshold"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="rs-cutoff"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Match cutoff (%)
            </label>
            <input
              id="rs-cutoff"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="rs-hide"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Hide elements
          </label>
          <textarea
            id="rs-hide"
            value={hideText}
            onChange={(e) => setHideText(e.target.value)}
            rows={2}
            placeholder={'#onetrust-consent-sdk\n.cookie-banner'}
            className={`${inputClass} font-mono text-sm`}
          />
          <p className="mt-1 text-xs text-gray-500">
            One CSS selector per line, hidden with display: none before the
            screenshot. Covers banners that appear after the page loads.
          </p>
        </div>

        <div>
          <label
            htmlFor="rs-click"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Dismiss by clicking
          </label>
          <textarea
            id="rs-click"
            value={clickText}
            onChange={(e) => setClickText(e.target.value)}
            rows={2}
            placeholder={'#onetrust-accept-btn-handler'}
            className={`${inputClass} font-mono text-sm`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Prefer hiding. Each selector that never appears costs a wait on
            every page, and accepting a consent banner loads the scripts it
            gated, which can shift the layout.
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={fullPage}
              onChange={(e) => setFullPage(e.target.checked)}
            />
            <span>Capture the entire scroll height</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={excludeHttpErrors}
              onChange={(e) => setExcludeHttpErrors(e.target.checked)}
            />
            <span>Exclude HTTP error pages</span>
          </label>
        </div>

        <div>
          <label
            htmlFor="rs-concurrency"
            className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1"
          >
            <span>Parallel pages</span>
            <span className="font-mono text-gray-500">{concurrency}</span>
          </label>
          <input
            id="rs-concurrency"
            type="range"
            min={1}
            max={MAX_CONCURRENCY}
            step={1}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={rerun}
            disabled={submitting || run.status === 'running'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting
              ? 'Starting…'
              : `Re-run ${slugs.length} pages with these settings`}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Replaces this run&apos;s screenshots and results. To keep the
            current ones, use Run Again instead.
          </p>
        </div>
      </div>
    </details>
  )
}
