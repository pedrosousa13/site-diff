'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Check } from 'lucide-react'
import type { ComparisonRun, PageResult } from '@/lib/types'
import { getAllSlugs, getErrorSlugs, getPendingSlugs } from '@/lib/runResults'
import DiffViewer from './DiffViewer'

interface Props {
  run: ComparisonRun
}

const POLL_MS = 1500

export default function ResultsGrid({ run: initialRun }: Props) {
  const [run, setRun] = useState<ComparisonRun>(initialRun)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  // slug -> version captured when re-run was requested; cleared once a newer version arrives.
  const rerunning = useRef<Map<string, number>>(new Map())
  const [rerunTick, setRerunTick] = useState(0)

  const slugs = getAllSlugs(run)
  const pending = getPendingSlugs(run)
  const errorSlugs = getErrorSlugs(run)
  const isRerunning = (slug: string) => rerunning.current.has(slug)
  const shouldPoll =
    run.status === 'running' || pending.length > 0 || rerunning.current.size > 0

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/runs/${run.id}`, { cache: 'no-store' })
    if (!res.ok) return
    const next: ComparisonRun = await res.json()
    // Clear re-run markers whose result version has advanced.
    let changed = false
    for (const [slug, atClick] of rerunning.current) {
      const r = next.results.find((x) => x.slug === slug)
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
        const current = run.results.find((r) => r.slug === slug)
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
    [run.id, run.results, refetch],
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

  // Slugs the modal can navigate between: those with a loaded, non-re-running result.
  const openableSlugs = slugs.filter((s) => {
    const r = run.results.find((x) => x.slug === s)
    return r && !isRerunning(s)
  })
  const currentIndex = selectedSlug ? openableSlugs.indexOf(selectedSlug) : -1

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

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {slugs.map((slug) => {
          const result = run.results.find((r) => r.slug === slug)
          return (
            <ResultCard
              key={slug}
              slug={slug}
              result={result}
              runId={run.id}
              pending={!result || isRerunning(slug)}
              checked={Boolean(result?.checked)}
              onClick={() => result && setSelectedSlug(slug)}
              onRerun={() => rerun([slug])}
            />
          )
        })}
      </div>

      {/* Modal */}
      {selectedSlug && run.results.find((r) => r.slug === selectedSlug) && (
        <DiffViewer
          runId={run.id}
          slug={selectedSlug}
          result={run.results.find((r) => r.slug === selectedSlug)!}
          baseUrlA={run.baseUrlA}
          baseUrlB={run.baseUrlB}
          checked={Boolean(
            run.results.find((r) => r.slug === selectedSlug)!.checked,
          )}
          onToggleChecked={toggleChecked}
          onClose={() => setSelectedSlug(null)}
          onPrev={
            currentIndex > 0
              ? () => setSelectedSlug(openableSlugs[currentIndex - 1])
              : undefined
          }
          onNext={
            currentIndex >= 0 && currentIndex < openableSlugs.length - 1
              ? () => setSelectedSlug(openableSlugs[currentIndex + 1])
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
  result,
  runId,
  pending,
  checked,
  onClick,
  onRerun,
}: {
  slug: string
  result: PageResult | undefined
  runId: string
  pending: boolean
  checked: boolean
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
      <button
        onClick={onClick}
        disabled={pending}
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
        {pending ? (
          <div className="mt-1 h-3 w-16 rounded bg-gray-200 animate-pulse" />
        ) : (
          <div className="text-xs text-gray-500 mt-1 break-words">
            {result!.status === 'error'
              ? result!.error
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
