'use client'

import { useState } from 'react'
import Link from 'next/link'
import { parseShortId } from '@/lib/runResults'
import type { ComparisonRun } from '@/lib/types'

interface Props {
  initialRuns: ComparisonRun[]
}

export default function PastRuns({ initialRuns }: Props) {
  const [runs, setRuns] = useState(initialRuns)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{
    runId: string
    message: string
  } | null>(null)

  const handleDelete = async (run: ComparisonRun) => {
    if (run.status === 'running') return
    if (
      !window.confirm(
        `Delete run ${parseShortId(run.id)}? Its screenshots and diffs will be permanently removed.`,
      )
    ) {
      return
    }

    setDeletingId(run.id)
    setDeleteError(null)

    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Failed to delete run')
      }

      setRuns((current) => current.filter(({ id }) => id !== run.id))
    } catch (error) {
      setDeleteError({
        runId: run.id,
        message:
          error instanceof Error ? error.message : 'Failed to delete run',
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (runs.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-xl font-semibold mb-4">Past Runs</h2>
      <div className="space-y-2">
        {runs.map((run) => {
          const matches = run.results.filter(
            (result) => result.status === 'match',
          ).length
          const diffs = run.results.filter(
            (result) => result.status === 'diff',
          ).length
          const isRunning = run.status === 'running'
          const isDeleting = deletingId === run.id

          return (
            <div key={run.id} className="p-3 rounded-md border">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">
                      {new Date(run.createdAt).toLocaleDateString('en-GB')}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">
                      {new Date(run.createdAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="font-mono font-medium">
                      {parseShortId(run.id)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {run.baseUrlA} vs {run.baseUrlB}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm shrink-0">
                  <span className="text-green-600">{matches} ✓</span>
                  <span className="text-red-600">{diffs} ✗</span>
                  <Link
                    href={`/runs/${run.id}`}
                    className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-md"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(run)}
                    disabled={isRunning || isDeleting}
                    title={
                      isRunning
                        ? 'Running runs cannot be deleted because cancellation is not supported'
                        : undefined
                    }
                    className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-md disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    {isDeleting
                      ? 'Deleting…'
                      : isRunning
                        ? 'Delete after run finishes'
                        : 'Delete'}
                  </button>
                </div>
              </div>

              {deleteError?.runId === run.id && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  Could not delete this run: {deleteError.message}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
