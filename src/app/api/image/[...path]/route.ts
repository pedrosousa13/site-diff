import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params
  const baseDir = path.join(process.cwd(), 'data', 'runs')
  const imagePath = path.resolve(baseDir, ...pathSegments)

  if (!imagePath.startsWith(baseDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
  }

  try {
    const buffer = await fs.readFile(imagePath)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }
}
