import { describe, it, expect, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { PNG } from 'pngjs'
import { determineStatus, diffImages, diffImagesToBuffer } from './differ'

const tmp = path.join(os.tmpdir(), 'site-diff-differ-test')

async function writeSolid(file: string, r: number, g: number, b: number) {
  const png = new PNG({ width: 3, height: 3 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r
    png.data[i + 1] = g
    png.data[i + 2] = b
    png.data[i + 3] = 255
  }
  await fs.writeFile(file, PNG.sync.write(png))
}

async function centerPixel(file: string): Promise<[number, number, number]> {
  const png = PNG.sync.read(await fs.readFile(file))
  const idx = (png.width * 1 + 1) * 4 // pixel (1,1)
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2]]
}

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('diffImages two-color overlay', () => {
  it('paints added/darker-in-B pixels green', async () => {
    await fs.mkdir(tmp, { recursive: true })
    const a = path.join(tmp, 'a1.png')
    const b = path.join(tmp, 'b1.png')
    const out = path.join(tmp, 'd1.png')
    await writeSolid(a, 255, 255, 255) // A white
    await writeSolid(b, 0, 0, 0) // B black -> B darker -> added
    await diffImages(a, b, out, 0.1)
    expect(await centerPixel(out)).toEqual([0, 180, 80])
  })

  it('paints removed/lighter-in-B pixels red', async () => {
    await fs.mkdir(tmp, { recursive: true })
    const a = path.join(tmp, 'a2.png')
    const b = path.join(tmp, 'b2.png')
    const out = path.join(tmp, 'd2.png')
    await writeSolid(a, 0, 0, 0) // A black
    await writeSolid(b, 255, 255, 255) // B white -> B lighter -> removed
    await diffImages(a, b, out, 0.1)
    expect(await centerPixel(out)).toEqual([255, 0, 0])
  })
})

describe('determineStatus', () => {
  it('uses the default 0.05% cutoff, matching at the boundary', () => {
    expect(determineStatus(0.049)).toBe('match')
    expect(determineStatus(0.05)).toBe('match')
    expect(determineStatus(0.051)).toBe('diff')
  })

  it('uses a custom match-percent cutoff', () => {
    expect(determineStatus(0.1, 0.2)).toBe('match')
    expect(determineStatus(0.2, 0.2)).toBe('match')
    expect(determineStatus(0.3, 0.2)).toBe('diff')
  })
})

describe('determineStatus with cutoff 0', () => {
  it('treats a pixel-identical page as a match when cutoff is 0', () => {
    expect(determineStatus(0, 0)).toBe('match')
  })

  it('treats any mismatch as a diff when cutoff is 0', () => {
    expect(determineStatus(0.0001, 0)).toBe('diff')
  })

  it('treats a page exactly at the cutoff as a match', () => {
    expect(determineStatus(0.05, 0.05)).toBe('match')
  })
})

describe('diffImagesToBuffer', () => {
  it('returns a PNG without writing an output file', async () => {
    await fs.mkdir(tmp, { recursive: true })
    const a = path.join(tmp, 'buffer-a.png')
    const b = path.join(tmp, 'buffer-b.png')
    await writeSolid(a, 255, 255, 255)
    await writeSolid(b, 0, 0, 0)

    const result = await diffImagesToBuffer(a, b, 0.1)
    const image = PNG.sync.read(result.buffer)

    expect(image.width).toBe(3)
    expect(image.height).toBe(3)
    expect(result.mismatchPixels).toBe(9)
    expect(result.mismatchPercent).toBe(100)
  })

  it('applies the requested per-pixel threshold', async () => {
    await fs.mkdir(tmp, { recursive: true })
    const a = path.join(tmp, 'threshold-a.png')
    const b = path.join(tmp, 'threshold-b.png')
    await writeSolid(a, 100, 100, 100)
    await writeSolid(b, 110, 110, 110)

    const strict = await diffImagesToBuffer(a, b, 0)
    const tolerant = await diffImagesToBuffer(a, b, 1)

    expect(strict.mismatchPixels).toBe(9)
    expect(tolerant.mismatchPixels).toBe(0)
  })
})
