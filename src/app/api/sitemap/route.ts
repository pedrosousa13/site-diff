import { NextRequest, NextResponse } from 'next/server'
import { fetchSitemap } from '@/lib/sitemap'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 },
    )
  }

  try {
    const slugs = await fetchSitemap(url)
    return NextResponse.json({ slugs })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to fetch sitemap',
      },
      { status: 500 },
    )
  }
}
