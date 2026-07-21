import { Suspense } from 'react'
import { availableParallelism } from 'node:os'
import CompareForm from '@/components/CompareForm'
import PastRuns from '@/components/PastRuns'
import { deriveDefaultConcurrency } from '@/lib/concurrency'
import { listRuns } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const runs = await listRuns()
  const defaultConcurrency = deriveDefaultConcurrency(availableParallelism())

  return (
    <main className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Site Diff</h1>
      <p className="text-gray-600 mb-8">Visual comparison tool for websites</p>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">New Comparison</h2>
        <Suspense
          fallback={<div className="animate-pulse h-64 bg-gray-100 rounded" />}
        >
          <CompareForm defaultConcurrency={defaultConcurrency} />
        </Suspense>
      </div>

      <PastRuns initialRuns={runs} />
    </main>
  )
}
