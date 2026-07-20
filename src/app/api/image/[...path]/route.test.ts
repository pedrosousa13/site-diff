import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET } from './route'
import { promises as fs } from 'fs'

vi.mock('fs', () => ({
  promises: { readFile: vi.fn() },
}))

function get(segments: string[]) {
  return GET({} as NextRequest, {
    params: Promise.resolve({ path: segments }),
  })
}

beforeEach(() => {
  vi.mocked(fs.readFile).mockReset()
})

describe('GET /api/image/[...path]', () => {
  it('rejects traversal segments without touching the filesystem', async () => {
    const response = await get(['..', '..', 'secrets', 'id_rsa'])

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid image path' })
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('rejects a single traversal segment mixed into a valid path', async () => {
    const response = await get(['run-1', '..', '..', 'meta.json'])

    expect(response.status).toBe(400)
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('serves a valid image path under data/runs', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('png-bytes'))

    const response = await get(['run-1', 'diffs', 'home.png'])

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 404 when the file is missing', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    )

    const response = await get(['run-1', 'diffs', 'missing.png'])

    expect(response.status).toBe(404)
  })
})
