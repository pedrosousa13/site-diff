'use client'

import { useEffect, useRef, useState } from 'react'

const REDIFF_DEBOUNCE_MS = 250

interface Props {
  runId: string
  slug: string
  initialThreshold: number
}

export default function LiveThresholdViewer({
  runId,
  slug,
  initialThreshold,
}: Props) {
  const [threshold, setThreshold] = useState(initialThreshold)
  const [renderedThreshold, setRenderedThreshold] = useState<number | null>(
    null,
  )
  const [mismatchPercent, setMismatchPercent] = useState<number | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const imageUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let stale = false

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(
          `/api/runs/${encodeURIComponent(runId)}/rediff`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, threshold }),
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.error || 'Failed to recompute diff')
        }

        const mismatchHeader = response.headers.get(
          'X-Site-Diff-Mismatch-Percent',
        )
        const thresholdHeader = response.headers.get('X-Site-Diff-Threshold')
        if (mismatchHeader === null || thresholdHeader === null) {
          throw new Error('Diff response did not include metrics')
        }

        const nextMismatch = Number(mismatchHeader)
        const nextThreshold = Number(thresholdHeader)
        if (!Number.isFinite(nextMismatch) || !Number.isFinite(nextThreshold)) {
          throw new Error('Diff response included invalid metrics')
        }

        const blob = await response.blob()
        if (stale) return

        const nextImageUrl = URL.createObjectURL(blob)
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = nextImageUrl
        setImageUrl(nextImageUrl)
        setMismatchPercent(nextMismatch)
        setRenderedThreshold(nextThreshold)
      } catch (requestError) {
        if (
          !stale &&
          !(
            requestError instanceof DOMException &&
            requestError.name === 'AbortError'
          )
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Failed to recompute diff',
          )
        }
      } finally {
        if (!stale) setLoading(false)
      }
    }, REDIFF_DEBOUNCE_MS)

    return () => {
      stale = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [runId, slug, threshold])

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    }
  }, [])

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white py-3 space-y-2">
        <label className="flex items-center justify-between text-sm font-medium">
          <span>Per-pixel threshold</span>
          <output className="font-mono">{threshold.toFixed(2)}</output>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          className="w-full"
          aria-label="Per-pixel threshold"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          <span>Requested threshold: {threshold.toFixed(2)}</span>
          {renderedThreshold !== null && mismatchPercent !== null && (
            <span>
              Mismatch at {renderedThreshold.toFixed(2)}:{' '}
              {mismatchPercent.toFixed(4)}%
            </span>
          )}
          {loading && <span className="text-blue-600">Updating…</span>}
        </div>
      </div>

      {error && (
        <p className="my-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {imageUrl ? (
        <div className="flex justify-center">
          <img
            src={imageUrl}
            alt={`Live diff at threshold ${renderedThreshold?.toFixed(2)}`}
            className="max-w-full border rounded"
          />
        </div>
      ) : (
        <div className="h-48 bg-gray-100 rounded animate-pulse" />
      )}
    </div>
  )
}
