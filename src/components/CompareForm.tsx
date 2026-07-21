'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import { mergeSlugPairs, parseSlugLines, filterSitemapSlugs } from '@/lib/slugs'
import { parseSelectorLines, findInvalidSelector } from '@/lib/selectors'
import { parseMatchPercentCutoff } from '@/lib/cutoffInput'
import { DEFAULT_CONFIG, MAX_CONCURRENCY } from '@/lib/types'

const STORAGE_KEY = 'site-diff-form'
const SITEMAP_ROW_HEIGHT = 28

interface FormState {
  baseUrlA: string
  baseUrlB: string
  slugsText: string
  sitemapUrl: string
  clickSelectorsText: string
  hideSelectorsText: string
  threshold?: number
  matchPercentCutoff?: number
  excludeHttpErrors?: boolean
  concurrency?: number
}

function loadFromStorage(): FormState | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function saveToStorage(state: FormState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

interface Props {
  defaultConcurrency: number
}

export default function CompareForm({ defaultConcurrency }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)

  // Start with empty/default, hydrate from storage after mount
  const [baseUrlA, setBaseUrlA] = useState('')
  const [baseUrlB, setBaseUrlB] = useState('')
  const [slugsText, setSlugsText] = useState('/')
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [sitemapSlugs, setSitemapSlugs] = useState<string[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [filterText, setFilterText] = useState('')
  const [clickSelectorsText, setClickSelectorsText] = useState('')
  const [hideSelectorsText, setHideSelectorsText] = useState('')
  const [threshold, setThreshold] = useState(DEFAULT_CONFIG.threshold)
  const [matchPercentCutoffText, setMatchPercentCutoffText] = useState(
    String(DEFAULT_CONFIG.matchPercentCutoff),
  )
  const [excludeHttpErrors, setExcludeHttpErrors] = useState(true)
  const [concurrency, setConcurrency] = useState(defaultConcurrency)
  const [loading, setLoading] = useState(false)
  const [loadingSitemap, setLoadingSitemap] = useState(false)
  const [error, setError] = useState('')
  const sitemapListRef = useRef<HTMLDivElement>(null)
  const filteredSitemapSlugs = useMemo(
    () => filterSitemapSlugs(sitemapSlugs, filterText),
    [sitemapSlugs, filterText],
  )
  const sitemapVirtualizer = useVirtualizer({
    count: filteredSitemapSlugs.length,
    getScrollElement: () => sitemapListRef.current,
    estimateSize: () => SITEMAP_ROW_HEIGHT,
    overscan: 4,
    useFlushSync: false,
  })

  // Load from URL params or localStorage on mount
  useEffect(() => {
    const urlA = searchParams.get('baseUrlA')
    const urlB = searchParams.get('baseUrlB')
    // Repeated params, so a slug containing a comma survives the round-trip.
    const urlSlugs = searchParams.getAll('slugs')
    const urlSlugsB = searchParams.getAll('slugsB')
    const urlExcludeHttpErrors = searchParams.get('excludeHttpErrors')

    if (urlA || urlB || urlSlugs.length) {
      // URL params take priority (from "Run Again")
      if (urlA) setBaseUrlA(urlA)
      if (urlB) setBaseUrlB(urlB)
      if (urlSlugsB.length && urlSlugs.length) {
        setSlugsText(
          urlSlugs
            .map((a, i) => {
              const b = urlSlugsB[i]
              return b && b !== a ? `${a} -> ${b}` : a
            })
            .join('\n'),
        )
      } else if (urlSlugs.length) {
        setSlugsText(urlSlugs.join('\n'))
      }
      if (urlExcludeHttpErrors !== null) {
        setExcludeHttpErrors(urlExcludeHttpErrors !== 'false')
      }
      // Still hydrate fields URL params don't carry, so the save
      // effect doesn't clobber them in storage
      const saved = loadFromStorage()
      if (saved) {
        setSitemapUrl(saved.sitemapUrl)
        setClickSelectorsText(saved.clickSelectorsText ?? '')
        setHideSelectorsText(saved.hideSelectorsText ?? '')
        setThreshold(saved.threshold ?? DEFAULT_CONFIG.threshold)
        setMatchPercentCutoffText(
          String(saved.matchPercentCutoff ?? DEFAULT_CONFIG.matchPercentCutoff),
        )
        if (urlExcludeHttpErrors === null) {
          setExcludeHttpErrors(saved.excludeHttpErrors ?? true)
        }
        if (saved.concurrency) setConcurrency(saved.concurrency)
      }
    } else {
      // Fall back to localStorage
      const saved = loadFromStorage()
      if (saved) {
        setBaseUrlA(saved.baseUrlA)
        setBaseUrlB(saved.baseUrlB)
        const legacy = saved as FormState & {
          pairMode?: boolean
          slugsTextB?: string
        }
        if (legacy.pairMode && legacy.slugsTextB) {
          const linesB = legacy.slugsTextB.split('\n')
          setSlugsText(
            saved.slugsText
              .split('\n')
              .map((rawA, i) => {
                const a = rawA.trim()
                const b = (linesB[i] ?? '').trim()
                return a && b && b !== a ? `${a} -> ${b}` : rawA
              })
              .join('\n'),
          )
        } else {
          setSlugsText(saved.slugsText)
        }
        setSitemapUrl(saved.sitemapUrl)
        setClickSelectorsText(saved.clickSelectorsText ?? '')
        setHideSelectorsText(saved.hideSelectorsText ?? '')
        setThreshold(saved.threshold ?? DEFAULT_CONFIG.threshold)
        setMatchPercentCutoffText(
          String(saved.matchPercentCutoff ?? DEFAULT_CONFIG.matchPercentCutoff),
        )
        setExcludeHttpErrors(saved.excludeHttpErrors ?? true)
        if (saved.concurrency) setConcurrency(saved.concurrency)
      }
    }
    setMounted(true)
  }, [searchParams])

  // Save to localStorage on change
  useEffect(() => {
    if (!mounted) return
    saveToStorage({
      baseUrlA,
      baseUrlB,
      slugsText,
      sitemapUrl,
      clickSelectorsText,
      hideSelectorsText,
      threshold,
      matchPercentCutoff:
        parseMatchPercentCutoff(matchPercentCutoffText) ??
        DEFAULT_CONFIG.matchPercentCutoff,
      excludeHttpErrors,
      concurrency,
    })
  }, [
    baseUrlA,
    baseUrlB,
    slugsText,
    sitemapUrl,
    clickSelectorsText,
    hideSelectorsText,
    threshold,
    matchPercentCutoffText,
    excludeHttpErrors,
    concurrency,
    mounted,
  ])

  const handleFetchSitemap = async () => {
    if (!sitemapUrl) return
    setLoadingSitemap(true)
    setError('')

    try {
      const res = await fetch(
        `/api/sitemap?url=${encodeURIComponent(sitemapUrl)}`,
      )
      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else {
        setSitemapSlugs(data.slugs)
        setSelectedSlugs(new Set(data.slugs))
        setFilterText('')
      }
    } catch (e) {
      setError('Failed to fetch sitemap')
    } finally {
      setLoadingSitemap(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const matchPercentCutoff = parseMatchPercentCutoff(matchPercentCutoffText)
    if (matchPercentCutoff === null) {
      setError('Match cutoff must be a number between 0 and 100')
      setLoading(false)
      return
    }

    const parsed = parseSlugLines(slugsText)
    if (parsed.errors.length) {
      const first = parsed.errors[0]
      setError(`Line ${first.line}: ${first.message}`)
      setLoading(false)
      return
    }
    const merged = mergeSlugPairs(selectedSlugs, parsed.pairs)
    if (!merged.length) {
      setError('Enter at least one page to compare')
      setLoading(false)
      return
    }
    const slugsPayload = merged.every((p) => p.a === p.b)
      ? { slugs: merged.map((p) => p.a) }
      : { slugPairs: merged }

    const clickSelectors = parseSelectorLines(clickSelectorsText)
    const hideSelectors = parseSelectorLines(hideSelectorsText)

    const invalidSelector = findInvalidSelector([
      ...clickSelectors,
      ...hideSelectors,
    ])
    if (invalidSelector) {
      setError(`Invalid CSS selector: "${invalidSelector}"`)
      setLoading(false)
      return
    }

    const config: Record<string, unknown> = {
      threshold,
      matchPercentCutoff,
      excludeHttpErrors,
    }
    if (clickSelectors.length) config.clickSelectors = clickSelectors
    if (hideSelectors.length) config.hideSelectors = hideSelectors

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrlA,
          baseUrlB,
          ...slugsPayload,
          concurrency,
          config: Object.keys(config).length ? config : undefined,
        }),
      })

      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setLoading(false)
      } else {
        router.push(`/runs/${data.id}`)
      }
    } catch (e) {
      setError('Failed to start comparison')
      setLoading(false)
    }
  }

  // Live per-line hint driven by the same parser used on submit, so the
  // preview never disagrees with what actually happens when you run. Neutral
  // (no error styling) while the textarea is empty.
  const parsedPreview = parseSlugLines(slugsText)
  const lineErrors = parsedPreview.errors
  const pageCount = mergeSlugPairs(selectedSlugs, parsedPreview.pairs).length
  const pairedCount = parsedPreview.pairs.filter((p) => p.a !== p.b).length

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base URL A (e.g., staging)
          </label>
          <input
            type="url"
            value={baseUrlA}
            onChange={(e) => setBaseUrlA(e.target.value)}
            placeholder="https://staging.example.com"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base URL B (e.g., production)
          </label>
          <input
            type="url"
            value={baseUrlB}
            onChange={(e) => setBaseUrlB(e.target.value)}
            placeholder="https://example.com"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pages to compare (one per line; merged with any checked below)
        </label>
        <textarea
          value={slugsText}
          onChange={(e) => setSlugsText(e.target.value)}
          rows={6}
          placeholder={'/\n/about\n/de/uber-uns -> /en/about-us'}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Use <code className="font-mono">/a -&gt; /b</code> when a page has
          different slugs in the two environments.{' '}
          {lineErrors.length > 0 ? (
            <span className="text-amber-600">
              Line {lineErrors[0].line}: {lineErrors[0].message}
              {lineErrors.length > 1 &&
                ` (+${lineErrors.length - 1} more ${
                  lineErrors.length === 2 ? 'issue' : 'issues'
                })`}
            </span>
          ) : (
            pageCount > 0 && (
              <span>
                {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                {pairedCount > 0 && ` (${pairedCount} with a different B slug)`}
              </span>
            )
          )}
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Or fetch from sitemap
          </label>
          <input
            type="url"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder="https://example.com/sitemap.xml"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={handleFetchSitemap}
          disabled={loadingSitemap || !sitemapUrl}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          {loadingSitemap ? 'Fetching...' : 'Fetch'}
        </button>
      </div>

      {sitemapSlugs.length > 0 && (
        <div className="border border-gray-200 rounded-md p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter slugs (e.g. /mba)"
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() =>
                setSelectedSlugs(
                  (prev) => new Set([...prev, ...filteredSitemapSlugs]),
                )
              }
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() =>
                setSelectedSlugs((prev) => {
                  const next = new Set(prev)
                  filteredSitemapSlugs.forEach((s) => next.delete(s))
                  return next
                })
              }
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Clear
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {selectedSlugs.size} of {sitemapSlugs.length} selected
          </p>
          <div ref={sitemapListRef} className="max-h-64 overflow-y-auto">
            <div
              className="relative w-full"
              style={{ height: sitemapVirtualizer.getTotalSize() }}
            >
              {sitemapVirtualizer.getVirtualItems().map((virtualRow) => {
                const slug = filteredSitemapSlugs[virtualRow.index]
                return (
                  <label
                    key={virtualRow.key}
                    className="absolute top-0 left-0 w-full flex items-center gap-2 text-sm font-mono cursor-pointer"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSlugs.has(slug)}
                      onChange={(e) =>
                        setSelectedSlugs((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(slug)
                          else next.delete(slug)
                          return next
                        })
                      }
                    />
                    <span className="min-w-0 truncate">{slug}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Dismiss by clicking (one CSS selector per line)
        </label>
        <textarea
          value={clickSelectorsText}
          onChange={(e) => setClickSelectorsText(e.target.value)}
          rows={2}
          placeholder={'#onetrust-accept-btn-handler'}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Clicked after load to close consent banners / modals. Missing elements
          are skipped. Works across different domains.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Hide elements (one CSS selector per line)
        </label>
        <textarea
          value={hideSelectorsText}
          onChange={(e) => setHideSelectorsText(e.target.value)}
          rows={2}
          placeholder={'.cookie-banner\niframe'}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Hidden before screenshots are taken. Works across different domains.
        </p>
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={excludeHttpErrors}
            onChange={(e) => setExcludeHttpErrors(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">Exclude HTTP error pages</span>
            <span className="block text-xs text-gray-500 mt-1">
              Mark 4xx and 5xx responses as errors instead of comparing their
              screenshots.
            </span>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Per-pixel threshold
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Pixel sensitivity from 0 to 1. Higher values tolerate more visual
            noise.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Match cutoff (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={matchPercentCutoffText}
            onChange={(e) => setMatchPercentCutoffText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Pages at or below this mismatch percentage are treated as matches.
          </p>
        </div>
      </div>

      <div>
        <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
          <span>Parallel pages</span>
          <span className="font-mono text-gray-500">{concurrency}</span>
        </label>
        <input
          type="range"
          min={1}
          max={MAX_CONCURRENCY}
          step={1}
          value={concurrency}
          onChange={(e) => setConcurrency(Number(e.target.value))}
          className="w-full"
        />
        <p className="mt-1 text-xs text-gray-500">
          How many pages to compare at once. Each one renders 2 screenshots in
          parallel, so higher values use more CPU. Lower it if your machine runs
          hot.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !baseUrlA || !baseUrlB}
        className="w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
      >
        {loading ? 'Running comparison...' : 'Run Comparison'}
      </button>
    </form>
  )
}
