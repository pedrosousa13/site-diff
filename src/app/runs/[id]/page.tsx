import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMetadata } from '@/lib/storage'
import ResultsGrid from '@/components/ResultsGrid'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const run = await getMetadata(id)
  if (!run) return { title: 'Run not found · Site Diff' }
  const d = new Date(run.createdAt)
  const date = d.toLocaleDateString('en-GB')
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return { title: `${date} ${time} · Site Diff` }
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const run = await getMetadata(id)

  if (!run) {
    notFound()
  }

  // Repeated `slugs`/`slugsB` params round-trip slugs safely even when a slug
  // contains a comma (a single comma-joined value would split incorrectly).
  const rerunParams = new URLSearchParams()
  rerunParams.set('baseUrlA', run.baseUrlA)
  rerunParams.set('baseUrlB', run.baseUrlB)
  if (run.slugPairs) {
    for (const p of run.slugPairs) {
      rerunParams.append('slugs', p.a)
      rerunParams.append('slugsB', p.b)
    }
  } else {
    for (const r of run.results) rerunParams.append('slugs', r.slug)
  }

  return (
    <main className="container mx-auto p-8">
      <div className="mb-6">
        <Link href="/" className="text-blue-600 hover:underline text-sm">
          ← Back to home
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{run.id}</h1>
          <div className="text-gray-600 text-sm mt-1">
            {run.baseUrlA} vs {run.baseUrlB}
          </div>
          <div className="text-gray-400 text-xs mt-1">
            {new Date(run.createdAt).toLocaleString('en-GB')}
          </div>
        </div>
        <Link
          href={`/?${rerunParams.toString()}`}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          Run Again
        </Link>
      </div>

      <ResultsGrid run={run} />
    </main>
  )
}
