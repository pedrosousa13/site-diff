import { Suspense } from 'react'
import CompareForm from '@/components/CompareForm'
import { listRuns } from '@/lib/storage'
import { parseShortId } from '@/lib/runResults'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const runs = await listRuns()

  return (
    <main className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Site Diff</h1>
      <p className="text-gray-600 mb-8">Visual comparison tool for websites</p>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">New Comparison</h2>
        <Suspense
          fallback={<div className="animate-pulse h-64 bg-gray-100 rounded" />}
        >
          <CompareForm />
        </Suspense>
      </div>

      {runs.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">Past Runs</h2>
          <div className="space-y-2">
            {runs.map((run) => {
              const matches = run.results.filter(
                (r) => r.status === 'match',
              ).length
              const diffs = run.results.filter(
                (r) => r.status === 'diff',
              ).length

              return (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-md border"
                >
                  <div>
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
                    <div className="text-xs text-gray-500 mt-1">
                      {run.baseUrlA} vs {run.baseUrlB}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-green-600">{matches} ✓</span>
                    <span className="text-red-600">{diffs} ✗</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}
