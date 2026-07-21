'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { RefreshCw, Check, Eye } from 'lucide-react'
import type { ComparisonRun, PageResult } from '@/lib/types'
import {
  getErrorSlugs,
  getPendingSlugs,
  getSlugBMap,
  sortResultSlugs,
  type ResultSortMode,
} from '@/lib/runResults'
import DiffViewer from './DiffViewer'

interface Props {
  run: ComparisonRun
}

const POLL_MS = 1500
const RESULT_ROW_ESTIMATE = 240
const RESULT_ROW_GAP = 16

export function getResultColumnCount(viewportWidth: number): number {
  if (viewportWidth >= 1024) return 4
  if (viewportWidth >= 768) return 3
  return 2
}

function useResultColumnCount(): number {
  const [columnCount, setColumnCount] = useState(() =>
    typeof window !== 'undefined' ? getResultColumnCount(window.innerWidth) : 2,
  )

  useEffect(() => {
    const update = () => setColumnCount(getResultColumnCount(window.innerWidth))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return columnCount
}

export default function ResultsGrid({ run: initialRun }: Props) {
  const [run, setRun] = useState<ComparisonRun>(initialRun)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<ResultSortMode>('diff-desc')
  const [gridOffset, setGridOffset] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const columnCount = useResultColumnCount()
  // slug -> version captured when re-run was requested; cleared once a newer version arrives.
  const rerunning = useRef<Map<string, number>>(new Map())
  const [rerunTick, setRerunTick] = useState(0)

  const slugBMap = useMemo(() => getSlugBMap(run), [run])
  const resultsBySlug = useMemo(
    () => new Map(run.results.map((result) => [result.slug, result])),
    [run.results],
  )

  const slugs = useMemo(() => sortResultSlugs(run, sortMode), [run, sortMode])
  const pending = getPendingSlugs(run)
  const errorSlugs = getErrorSlugs(run)
  const isRerunning = (slug: string) => rerunning.current.has(slug)
  const shouldPoll =
    run.status === 'running' || pending.length > 0 || rerunning.current.size > 0
  const resultVirtualizer = useWindowVirtualizer({
    count: Math.ceil(slugs.length / columnCount),
    estimateSize: () => RESULT_ROW_ESTIMATE,
    gap: RESULT_ROW_GAP,
    overscan: 2,
    scrollMargin: gridOffset,
    useFlushSync: false,
  })

  useEffect(() => {
    const update = () => {
      const top = gridRef.current?.getBoundingClientRect().top
      setGridOffset(top === undefined ? 0 : top + window.scrollY)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [run.status, pending.length, errorSlugs.length])

  useEffect(() => {
    resultVirtualizer.measure()
  }, [columnCount, resultVirtualizer])

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/runs/${run.id}`, { cache: 'no-store' })
    if (!res.ok) return
    const next: ComparisonRun = await res.json()
    // Clear re-run markers whose result version has advanced.
    let changed = false
    const nextResultsBySlug = new Map(
      next.results.map((result) => [result.slug, result]),
    )
    for (const [slug, atClick] of rerunning.current) {
      const r = nextResultsBySlug.get(slug)
      if (r && r.version > atClick) {
        rerunning.current.delete(slug)
        changed = true
      }
    }
    setRun(next)
    if (changed) setRerunTick((t) => t + 1)
  }, [run.id])

  useEffect(() => {
    if (!shouldPoll) return
    const interval = setInterval(refetch, POLL_MS)
    return () => clearInterval(interval)
  }, [shouldPoll, refetch, rerunTick])

  const rerun = useCallback(
    async (slugsToRun: string[]) => {
      if (!slugsToRun.length) return
      for (const slug of slugsToRun) {
        const current = resultsBySlug.get(slug)
        rerunning.current.set(slug, current?.version ?? 0)
      }
      setRerunTick((t) => t + 1)
      await fetch(`/api/runs/${run.id}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs: slugsToRun }),
      })
      refetch()
    },
    [run.id, resultsBySlug, refetch],
  )

  const toggleChecked = useCallback(
    async (slug: string, checked: boolean) => {
      setRun((prev) => ({
        ...prev,
        results: prev.results.map((r) =>
          r.slug === slug ? { ...r, checked } : r,
        ),
      }))
      await fetch(`/api/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, checked }),
      })
    },
    [run.id],
  )

  const openResult = useCallback(
    (slug: string) => {
      const result = resultsBySlug.get(slug)
      if (!result) return

      setSelectedSlug(slug)
      if (result.viewed) return

      setRun((prev) => ({
        ...prev,
        results: prev.results.map((r) =>
          r.slug === slug ? { ...r, viewed: true } : r,
        ),
      }))
      void fetch(`/api/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, viewed: true }),
      })
    },
    [run.id, resultsBySlug],
  )

  // Slugs the modal can navigate between: those with a loaded, non-re-running, non-error result.
  const openableSlugs = slugs.filter((s) => {
    const r = resultsBySlug.get(s)
    return r && r.status !== 'error' && !isRerunning(s)
  })
  const currentIndex = selectedSlug ? openableSlugs.indexOf(selectedSlug) : -1
  const selectedResult = selectedSlug
    ? resultsBySlug.get(selectedSlug)
    : undefined

  const matches = run.results.filter((r) => r.status === 'match').length
  const diffs = run.results.filter((r) => r.status === 'diff').length
  const errors = errorSlugs.length

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm">{matches} matches</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm">{diffs} diffs</span>
        </div>
        {errors > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-sm">{errors} errors</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {(pending.length > 0 || rerunning.current.size > 0) && (
            <div className="flex items-center gap-2 text-gray-500">
              <RefreshSpinner />
              <span className="text-sm">
                {pending.length > 0
                  ? `Running diff ${slugs.length - pending.length + 1} of ${slugs.length}`
                  : `Re-running ${rerunning.current.size} ${rerunning.current.size === 1 ? 'page' : 'pages'}…`}
              </span>
            </div>
          )}
          {errors > 0 && (
            <button
              onClick={() => rerun(errorSlugs)}
              className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200"
            >
              Re-run failed
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Sort by
          <select
            value={sortMode}
            onChange={(event) =>
              setSortMode(event.target.value as ResultSortMode)
            }
            className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="diff-desc">Largest diff first</option>
            <option value="name">Name (A–Z)</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className="relative w-full"
        style={{ height: resultVirtualizer.getTotalSize() }}
      >
        {resultVirtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * columnCount
          const rowSlugs = slugs.slice(start, start + columnCount)
          return (
            <div
              key={virtualRow.key}
              ref={resultVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                transform: `translateY(${virtualRow.start - gridOffset}px)`,
              }}
            >
              {rowSlugs.map((slug) => {
                const result = resultsBySlug.get(slug)
                return (
                  <ResultCard
                    key={slug}
                    slug={slug}
                    slugB={slugBMap.get(slug) ?? slug}
                    result={result}
                    runId={run.id}
                    pending={!result || isRerunning(slug)}
                    checked={Boolean(result?.checked)}
                    viewed={Boolean(result?.viewed)}
                    onClick={() =>
                      result?.status !== 'error' && openResult(slug)
                    }
                    onRerun={() => rerun([slug])}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {selectedSlug && selectedResult && (
        <DiffViewer
          runId={run.id}
          slug={selectedSlug}
          slugB={slugBMap.get(selectedSlug) ?? selectedSlug}
          result={selectedResult}
          baseUrlA={run.baseUrlA}
          baseUrlB={run.baseUrlB}
          initialThreshold={run.config.threshold}
          checked={Boolean(selectedResult.checked)}
          onToggleChecked={toggleChecked}
          onClose={() => setSelectedSlug(null)}
          onPrev={
            currentIndex > 0
              ? () => openResult(openableSlugs[currentIndex - 1])
              : undefined
          }
          onNext={
            currentIndex >= 0 && currentIndex < openableSlugs.length - 1
              ? () => openResult(openableSlugs[currentIndex + 1])
              : undefined
          }
          position={
            currentIndex >= 0
              ? { index: currentIndex + 1, total: openableSlugs.length }
              : undefined
          }
        />
      )}
    </div>
  )
}

function RefreshSpinner() {
  return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
}

function ResultCard({
  slug,
  slugB,
  result,
  runId,
  pending,
  checked,
  viewed,
  onClick,
  onRerun,
}: {
  slug: string
  slugB: string
  result: PageResult | undefined
  runId: string
  pending: boolean
  checked: boolean
  viewed: boolean
  onClick: () => void
  onRerun: () => void
}) {
  const filename =
    slug === '/'
      ? 'home.png'
      : `${slug.replace(/^\//, '').replace(/\//g, '-')}.png`
  const diffUrl = `/api/image/${runId}/diffs/${filename}?v=${result?.version ?? 1}`

  const statusColors: Record<string, string> = {
    match: 'border-green-500 bg-green-50',
    diff: 'border-red-500 bg-red-50',
    error: 'border-yellow-500 bg-yellow-50',
  }
  const borderClass = pending
    ? 'border-gray-200 bg-gray-50'
    : statusColors[result!.status]

  return (
    <div
      className={`relative p-3 rounded-lg border-2 ${borderClass} transition-shadow ${checked ? 'opacity-60' : ''}`}
    >
      {checked && (
        <span
          className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center shadow"
          title="Reviewed"
        >
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      )}
      {viewed && !checked && (
        <span
          className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center shadow"
          title="Viewed"
        >
          <Eye className="w-3 h-3" />
        </span>
      )}
      <button
        onClick={onClick}
        disabled={pending || result?.status === 'error'}
        className="w-full text-left disabled:cursor-default"
      >
        {pending ? (
          <div className="aspect-video rounded mb-2 bg-gray-200 animate-pulse" />
        ) : (
          result!.status !== 'error' && (
            <div className="aspect-video bg-gray-100 rounded mb-2 overflow-hidden">
              <img
                src={diffUrl}
                alt={`Diff for ${slug}`}
                className="w-full h-full object-cover object-top"
              />
            </div>
          )
        )}
        <div className="font-mono text-sm truncate">{slug}</div>
        {slugB !== slug && (
          <div className="font-mono text-xs text-gray-400 truncate">
            B: {slugB}
          </div>
        )}
        {pending ? (
          <div className="mt-1 h-3 w-16 rounded bg-gray-200 animate-pulse" />
        ) : (
          <div className="text-xs text-gray-500 mt-1 break-words">
            {result!.status === 'error'
              ? [
                  result!.statusCodeA && `A: HTTP ${result!.statusCodeA}`,
                  result!.statusCodeB && `B: HTTP ${result!.statusCodeB}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || result!.error
              : `${result!.mismatchPercent.toFixed(2)}% diff`}
          </div>
        )}
        {!pending && result!.sizeDiff && (
          <div className="text-xs text-yellow-600 mt-1">Size differs</div>
        )}
      </button>
      {!pending && result!.status === 'error' && (
        <button
          onClick={onRerun}
          className="mt-2 w-full px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
        >
          Re-run
        </button>
      )}
    </div>
  )
}
