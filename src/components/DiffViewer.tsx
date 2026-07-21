'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Maximize2,
  X,
  ChevronsLeftRight,
} from 'lucide-react'
import type { PageResult } from '@/lib/types'
import LiveThresholdViewer from './LiveThresholdViewer'

interface Props {
  runId: string
  slug: string
  /** Environment-B slug; equals `slug` outside pair mode. */
  slugB: string
  result: PageResult
  baseUrlA: string
  baseUrlB: string
  initialThreshold: number
  checked: boolean
  onToggleChecked: (slug: string, checked: boolean) => void
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  position?: { index: number; total: number }
}

type ViewMode = 'side-by-side' | 'diff' | 'slider' | 'threshold'

export default function DiffViewer({
  runId,
  slug,
  slugB,
  result,
  baseUrlA,
  baseUrlB,
  initialThreshold,
  checked,
  onToggleChecked,
  onClose,
  onPrev,
  onNext,
  position,
}: Props) {
  // Full page URLs for the current slug, matching how the screenshots were taken (runner.ts).
  const pageUrlA = new URL(slug, baseUrlA).toString()
  const pageUrlB = new URL(slugB, baseUrlB).toString()
  const [mode, setMode] = useState<ViewMode>('side-by-side')
  const [sliderPos, setSliderPos] = useState(50)
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    setSliderPos((x / rect.width) * 100)
  }, [])

  const handleMouseUp = useCallback(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  const handleMouseDown = useCallback(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove, handleMouseUp])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack arrow keys while the user is adjusting the slider.
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') onPrev?.()
      else if (e.key === 'ArrowRight') onNext?.()
      else if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onPrev, onNext, onClose])

  const filename =
    slug === '/'
      ? 'home.png'
      : `${slug.replace(/^\//, '').replace(/\//g, '-')}.png`
  const v = `?v=${result.version ?? 1}`
  const imgA = `/api/image/${runId}/screenshots/a/${filename}${v}`
  const imgB = `/api/image/${runId}/screenshots/b/${filename}${v}`
  const imgDiff = `/api/image/${runId}/diffs/${filename}${v}`

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {onPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/80 hover:bg-white shadow-lg"
          title="Previous (←)"
          aria-label="Previous"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {onNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/80 hover:bg-white shadow-lg"
          title="Next (→)"
          aria-label="Next"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
      <div
        className={`bg-white rounded-lg max-h-[90vh] flex flex-col ${
          expanded ? 'w-[90vw] max-w-none' : 'w-full max-w-6xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div className="min-w-0">
            <h2 className="font-mono text-lg truncate">
              {slug}
              {slugB !== slug && (
                <>
                  <span className="text-gray-400"> vs </span>
                  {slugB}
                </>
              )}
            </h2>
            <span className="text-sm text-gray-500">
              {result.mismatchPercent.toFixed(2)}% difference
              {position && (
                <span className="ml-2 text-gray-400">
                  ({position.index} of {position.total})
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="p-2 hover:bg-gray-100 rounded-md"
              title={expanded ? 'Shrink' : 'Expand to 90% width'}
              aria-label={expanded ? 'Shrink' : 'Expand'}
            >
              {expanded ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs + reviewed checkbox */}
        <div className="flex items-center justify-between gap-2 p-4 border-b">
          <div className="flex gap-2">
            {(
              ['side-by-side', 'diff', 'slider', 'threshold'] as ViewMode[]
            ).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  mode === m ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                }`}
              >
                {m === 'side-by-side'
                  ? 'Side by Side'
                  : m === 'diff'
                    ? 'Diff Overlay'
                    : m === 'slider'
                      ? 'Slider'
                      : 'Live Threshold'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onToggleChecked(slug, e.target.checked)}
              className="w-4 h-4"
            />
            Checked
          </label>
        </div>

        {/* Cached-image panels stay mounted to avoid reload blink. Live threshold mounts on demand. */}
        <div className="flex-1 overflow-auto pb-4 px-4">
          <div className={mode === 'side-by-side' ? '' : 'hidden'}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="sticky top-0 z-10 bg-white text-sm text-gray-500 py-2 flex items-center gap-2">
                  <span className="truncate">{pageUrlA}</span>
                  <a
                    href={pageUrlA}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                  >
                    Open in new tab ↗
                  </a>
                </div>
                <img
                  src={imgA}
                  alt="Version A"
                  className="w-full border rounded"
                />
              </div>
              <div>
                <div className="sticky top-0 z-10 bg-white text-sm text-gray-500 py-2 flex items-center gap-2">
                  <span className="truncate">{pageUrlB}</span>
                  <a
                    href={pageUrlB}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                  >
                    Open in new tab ↗
                  </a>
                </div>
                <img
                  src={imgB}
                  alt="Version B"
                  className="w-full border rounded"
                />
              </div>
            </div>
          </div>

          <div className={mode === 'diff' ? '' : 'hidden'}>
            <div className="sticky top-0 z-10 bg-white flex items-center gap-4 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: '#00b450' }}
                />
                Added in B (darker than A)
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: '#ff0000' }}
                />
                Removed in B (lighter than A)
              </span>
            </div>
            <div className="flex justify-center">
              <img
                src={imgDiff}
                alt="Diff"
                className="max-w-full border rounded"
              />
            </div>
          </div>

          <div className={mode === 'slider' ? '' : 'hidden'}>
            <div className="sticky top-0 z-10 bg-white py-2">
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>A: {baseUrlA}</span>
                <span>B: {baseUrlB}</span>
              </div>
            </div>
            <div className="relative select-none">
              <div
                ref={containerRef}
                className="relative border rounded cursor-ew-resize"
                onMouseDown={handleMouseDown}
              >
                <img src={imgB} alt="Version B" className="w-full block" />
                <img
                  src={imgA}
                  alt="Version A"
                  className="absolute top-0 left-0 w-full block"
                  style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-500 cursor-ew-resize"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                    <ChevronsLeftRight className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {mode === 'threshold' && (
            <LiveThresholdViewer
              key={`${runId}:${slug}`}
              runId={runId}
              slug={slug}
              initialThreshold={initialThreshold}
            />
          )}
        </div>
      </div>
    </div>
  )
}
