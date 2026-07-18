'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { mergeSlugs, zipSlugPairs } from '@/lib/slugs'
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from '@/lib/types'

const STORAGE_KEY = 'site-diff-form'

interface FormState {
  baseUrlA: string
  baseUrlB: string
  slugsText: string
  sitemapUrl: string
  clickSelectorsText: string
  concurrency?: number
  pairMode?: boolean
  slugsTextB?: string
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

export default function CompareForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)

  // Start with empty/default, hydrate from storage after mount
  const [baseUrlA, setBaseUrlA] = useState('')
  const [baseUrlB, setBaseUrlB] = useState('')
  const [slugsText, setSlugsText] = useState('/')
  const [pairMode, setPairMode] = useState(false)
  const [slugsTextB, setSlugsTextB] = useState('')
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [sitemapSlugs, setSitemapSlugs] = useState<string[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [filterText, setFilterText] = useState('')
  const [clickSelectorsText, setClickSelectorsText] = useState('')
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY)
  const [loading, setLoading] = useState(false)
  const [loadingSitemap, setLoadingSitemap] = useState(false)
  const [error, setError] = useState('')

  // Load from URL params or localStorage on mount
  useEffect(() => {
    const urlA = searchParams.get('baseUrlA')
    const urlB = searchParams.get('baseUrlB')
    // Repeated params, so a slug containing a comma survives the round-trip.
    const urlSlugs = searchParams.getAll('slugs')
    const urlSlugsB = searchParams.getAll('slugsB')

    if (urlA || urlB || urlSlugs.length || urlSlugsB.length) {
      // URL params take priority (from "Run Again")
      if (urlA) setBaseUrlA(urlA)
      if (urlB) setBaseUrlB(urlB)
      if (urlSlugs.length) setSlugsText(urlSlugs.join('\n'))
      if (urlSlugsB.length) {
        setPairMode(true)
        setSlugsTextB(urlSlugsB.join('\n'))
      }
    } else {
      // Fall back to localStorage
      const saved = loadFromStorage()
      if (saved) {
        setBaseUrlA(saved.baseUrlA)
        setBaseUrlB(saved.baseUrlB)
        setSlugsText(saved.slugsText)
        setPairMode(saved.pairMode ?? false)
        setSlugsTextB(saved.slugsTextB ?? '')
        setSitemapUrl(saved.sitemapUrl)
        setClickSelectorsText(saved.clickSelectorsText ?? '')
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
      pairMode,
      slugsTextB,
      sitemapUrl,
      clickSelectorsText,
      concurrency,
    })
  }, [
    baseUrlA,
    baseUrlB,
    slugsText,
    pairMode,
    slugsTextB,
    sitemapUrl,
    clickSelectorsText,
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

    let slugsPayload: {
      slugs?: string[]
      slugPairs?: { a: string; b: string }[]
    }
    if (pairMode) {
      const zipped = zipSlugPairs(slugsText, slugsTextB)
      if (!zipped.ok) {
        setError(zipped.error)
        setLoading(false)
        return
      }
      slugsPayload = { slugPairs: zipped.pairs }
    } else {
      slugsPayload = { slugs: mergeSlugs(selectedSlugs, slugsText) }
    }

    const clickSelectors = clickSelectorsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const config: Record<string, unknown> = {}
    if (clickSelectors.length) config.clickSelectors = clickSelectors

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

  // Live pairing hint driven by the same validator used on submit, so the
  // preview never disagrees with what actually happens when you run.
  const pairPreview = pairMode ? zipSlugPairs(slugsText, slugsTextB) : null

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

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={pairMode}
          onChange={(e) => setPairMode(e.target.checked)}
        />
        Use different slugs per environment
      </label>

      {pairMode ? (
        <div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slugs for environment A (one per line)
              </label>
              <textarea
                value={slugsText}
                onChange={(e) => setSlugsText(e.target.value)}
                rows={6}
                placeholder={
                  '/preview/de/\n/preview/acquisition-content/de/cc/ty_br_ilc/'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slugs for environment B (paired by line)
              </label>
              <textarea
                value={slugsTextB}
                onChange={(e) => setSlugsTextB(e.target.value)}
                rows={6}
                placeholder={'/\n/cc/ty_br_ilc/'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Line 1 of A is compared against line 1 of B, and so on.{' '}
            {pairPreview?.ok ? (
              <span>
                {pairPreview.pairs.length}{' '}
                {pairPreview.pairs.length === 1 ? 'pair' : 'pairs'}
              </span>
            ) : (
              <span className="text-amber-600">{pairPreview?.error}</span>
            )}
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pages to compare (one slug per line; merged with any checked below)
          </label>
          <textarea
            value={slugsText}
            onChange={(e) => setSlugsText(e.target.value)}
            rows={6}
            placeholder={'/\n/about\n/contact'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
        </div>
      )}

      {pairMode && (
        <p className="text-xs text-gray-400">
          Sitemap import is available only when both environments share the same
          slugs.
        </p>
      )}

      {pairMode && selectedSlugs.size > 0 && (
        <p className="text-xs text-amber-600">
          {selectedSlugs.size} sitemap-selected{' '}
          {selectedSlugs.size === 1 ? 'slug is' : 'slugs are'} ignored in
          per-environment mode — only the paired lines above are compared.
        </p>
      )}

      {!pairMode && (
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
      )}

      {!pairMode &&
        sitemapSlugs.length > 0 &&
        (() => {
          const filtered = sitemapSlugs.filter((s) =>
            s.includes(filterText.trim()),
          )
          return (
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
                    setSelectedSlugs((prev) => new Set([...prev, ...filtered]))
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
                      filtered.forEach((s) => next.delete(s))
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
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filtered.map((slug) => (
                  <label
                    key={slug}
                    className="flex items-center gap-2 text-sm font-mono cursor-pointer"
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
                    <span>{slug}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })()}

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
