import { promises as fs } from 'fs'
import path from 'path'
import type { ComparisonRun } from './types'

const DATA_DIR = path.join(process.cwd(), 'data', 'runs')

export async function ensureRunDir(runId: string): Promise<string> {
  const runDir = path.join(DATA_DIR, runId)
  await fs.mkdir(path.join(runDir, 'screenshots', 'a'), { recursive: true })
  await fs.mkdir(path.join(runDir, 'screenshots', 'b'), { recursive: true })
  await fs.mkdir(path.join(runDir, 'diffs'), { recursive: true })
  return runDir
}

export async function saveMetadata(run: ComparisonRun): Promise<void> {
  const metaPath = path.join(DATA_DIR, run.id, 'meta.json')
  await fs.writeFile(metaPath, JSON.stringify(run, null, 2))
}

export async function getMetadata(
  runId: string,
): Promise<ComparisonRun | null> {
  try {
    const metaPath = path.join(DATA_DIR, runId, 'meta.json')
    const content = await fs.readFile(metaPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function listRuns(): Promise<ComparisonRun[]> {
  try {
    const dirs = await fs.readdir(DATA_DIR)
    const runs: ComparisonRun[] = []
    for (const dir of dirs) {
      const meta = await getMetadata(dir)
      if (meta) runs.push(meta)
    }
    return runs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  } catch {
    return []
  }
}

export function isSafeRunId(runId: string): boolean {
  return (
    runId.length > 0 &&
    !runId.includes('/') &&
    !runId.includes('\\') &&
    !runId.includes('..')
  )
}

export async function deleteRun(runId: string): Promise<void> {
  if (!isSafeRunId(runId)) {
    throw new Error(`Invalid run id: ${runId}`)
  }
  const runDir = path.join(DATA_DIR, runId)
  await fs.rm(runDir, { recursive: true, force: true })
}

export function getScreenshotPath(
  runId: string,
  side: 'a' | 'b',
  slug: string,
): string {
  const filename = slugToFilename(slug)
  return path.join(DATA_DIR, runId, 'screenshots', side, filename)
}

export function getDiffPath(runId: string, slug: string): string {
  const filename = slugToFilename(slug)
  return path.join(DATA_DIR, runId, 'diffs', filename)
}

function slugToFilename(slug: string): string {
  const name =
    slug === '/' ? 'home' : slug.replace(/^\//, '').replace(/\//g, '-')
  return `${name}.png`
}
