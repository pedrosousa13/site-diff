import { promises as fs } from 'fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import type { PageResult } from './types'

// Diff overlay colors. pixelmatch uses diffColorAlt when the pixel is darker
// in B than in A, and diffColor otherwise.
const DIFF_COLOR_REMOVED: [number, number, number] = [255, 0, 0] // B lighter than A
const DIFF_COLOR_ADDED: [number, number, number] = [0, 180, 80] // B darker than A

export interface DiffResult {
  mismatchPixels: number
  mismatchPercent: number
  sizeDiff: boolean
}

export interface BufferedDiffResult extends DiffResult {
  buffer: Buffer
}

export async function diffImages(
  imgPathA: string,
  imgPathB: string,
  diffOutputPath: string,
  threshold: number = 0.1,
): Promise<DiffResult> {
  const { buffer, ...result } = await diffImagesToBuffer(
    imgPathA,
    imgPathB,
    threshold,
  )
  await fs.writeFile(diffOutputPath, buffer)
  return result
}

export async function diffImagesToBuffer(
  imgPathA: string,
  imgPathB: string,
  threshold: number = 0.1,
): Promise<BufferedDiffResult> {
  const [bufferA, bufferB] = await Promise.all([
    fs.readFile(imgPathA),
    fs.readFile(imgPathB),
  ])

  const imgA = PNG.sync.read(bufferA)
  const imgB = PNG.sync.read(bufferB)

  const sizeDiff = imgA.width !== imgB.width || imgA.height !== imgB.height

  // Use larger dimensions for comparison
  const width = Math.max(imgA.width, imgB.width)
  const height = Math.max(imgA.height, imgB.height)

  // Pad images if needed
  const paddedA = padImage(imgA, width, height)
  const paddedB = padImage(imgB, width, height)

  const diff = new PNG({ width, height })

  const mismatchPixels = pixelmatch(
    paddedA.data,
    paddedB.data,
    diff.data,
    width,
    height,
    {
      threshold,
      diffColor: DIFF_COLOR_REMOVED,
      diffColorAlt: DIFF_COLOR_ADDED,
    },
  )

  const totalPixels = width * height
  const mismatchPercent = (mismatchPixels / totalPixels) * 100

  return {
    buffer: PNG.sync.write(diff),
    mismatchPixels,
    mismatchPercent,
    sizeDiff,
  }
}

function padImage(img: PNG, targetWidth: number, targetHeight: number): PNG {
  if (img.width === targetWidth && img.height === targetHeight) {
    return img
  }

  const padded = new PNG({
    width: targetWidth,
    height: targetHeight,
    fill: true,
  })

  // Fill with opaque white. Buffer.fill(255) is a native memset — sets every
  // RGBA byte to 255 in one pass, far faster than a per-pixel JS loop on the
  // millions of pixels a full-page screenshot produces.
  padded.data.fill(255)

  // Copy original image
  PNG.bitblt(img, padded, 0, 0, img.width, img.height, 0, 0)

  return padded
}

export function determineStatus(
  mismatchPercent: number,
  matchPercentCutoff: number = 0.05,
): PageResult['status'] {
  // <= so a cutoff of 0 still classifies pixel-identical pages as matches.
  return mismatchPercent <= matchPercentCutoff ? 'match' : 'diff'
}
