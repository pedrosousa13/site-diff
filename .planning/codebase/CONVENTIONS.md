# Coding Conventions

**Analysis Date:** 2026-04-27

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` — e.g., `CompareForm.tsx`, `ResultsGrid.tsx`, `DiffViewer.tsx` in `src/components/`
- Library/utility modules: `camelCase.ts` — e.g., `storage.ts`, `differ.ts`, `sitemap.ts`, `screenshotter.ts`, `types.ts` in `src/lib/`
- Next.js App Router conventions: `page.tsx`, `layout.tsx`, `route.ts`, `globals.css` (lowercase, framework-mandated)
- Dynamic route segments: bracketed lowercase — e.g., `src/app/runs/[id]/page.tsx`, `src/app/api/image/[...path]/route.ts`
- Config files: lowercase with framework-prescribed suffix — `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`

**Functions:**
- `camelCase` for all functions — e.g., `fetchSitemap`, `parseSitemap`, `takeScreenshot`, `diffImages`, `determineStatus`, `ensureRunDir`, `saveMetadata`
- React components: `PascalCase` — e.g., `CompareForm`, `ResultsGrid`, `ResultCard`, `DiffViewer`, `RunPage`, `RootLayout`, `Home`
- Event handlers prefixed with `handle` — e.g., `handleSubmit`, `handleFetchSitemap`, `handleMouseDown`, `handleMouseMove`, `handleMouseUp`
- Internal helpers stay unexported (no `export` keyword) — e.g., `padImage` in `src/lib/differ.ts:55`, `slugToFilename` in `src/lib/storage.ts:61`, `urlToSlug` in `src/lib/sitemap.ts:52`, `hideElements` in `src/lib/screenshotter.ts:69`

**Variables:**
- `camelCase` for locals and params — e.g., `runId`, `baseUrlA`, `mismatchPixels`, `sliderPos`
- `SCREAMING_SNAKE_CASE` for module-level constants — e.g., `DATA_DIR` in `src/lib/storage.ts:5`, `STORAGE_KEY` in `src/components/CompareForm.tsx:6`, `DEFAULT_CONFIG` in `src/lib/types.ts:28`
- Boolean state: descriptive names — `loading`, `loadingSitemap`, `mounted`, `sizeDiff`

**Types:**
- `PascalCase` for `interface` and `type` aliases — e.g., `ComparisonConfig`, `PageResult`, `ComparisonRun`, `DiffResult`, `FormState`, `Props`, `ViewMode`, `SitemapUrl`
- Per-component `Props` interfaces declared inline above the component — see `src/components/ResultsGrid.tsx:7`, `src/components/DiffViewer.tsx:6`
- String-literal unions for status/mode enums — e.g., `'match' | 'diff' | 'error'` (`src/lib/types.ts:13`), `'running' | 'completed' | 'failed'` (`src/lib/types.ts:25`), `'side-by-side' | 'diff' | 'slider'` (`src/components/DiffViewer.tsx:15`)

## Code Style

**Formatting:**
- No Prettier or Biome config detected
- 2-space indentation throughout
- No semicolons at statement ends (e.g., `src/lib/types.ts`, `src/app/page.tsx`)
- Single quotes for strings — e.g., `'use client'`, `'fs'`, `'next/server'`
- Backticks for template literals and multi-token paths
- Trailing commas in multi-line object/array literals — see `src/lib/types.ts:28-33`, `src/app/api/compare/route.ts:20-26`

**Linting:**
- `next lint` script declared in `package.json:9` (uses Next.js default ESLint preset; no custom `.eslintrc` present)
- TypeScript `strict: true` in `tsconfig.json:11`
- Target `ES2017`, module `esnext`, `moduleResolution: bundler`, `jsx: react-jsx`

## Import Organization

**Order (observed pattern):**
1. Node built-ins / framework imports — e.g., `import { Suspense } from 'react'`, `import { NextRequest, NextResponse } from 'next/server'`, `import { promises as fs } from 'fs'`, `import path from 'path'`
2. Third-party packages — e.g., `import { nanoid } from 'nanoid'`, `import { chromium, Browser, Page } from 'playwright'`, `import pixelmatch from 'pixelmatch'`, `import { PNG } from 'pngjs'`, `import { XMLParser } from 'fast-xml-parser'`
3. Internal aliased modules — e.g., `import CompareForm from '@/components/CompareForm'`, `import { listRuns } from '@/lib/storage'`
4. Relative imports — e.g., `import DiffViewer from './DiffViewer'`, `import type { ComparisonRun } from './types'`
5. `import type { ... }` used for type-only imports — see `src/lib/storage.ts:3`, `src/lib/differ.ts:4`, `src/components/ResultsGrid.tsx:4`

**Path Aliases:**
- `@/*` → `./src/*` (defined in `tsconfig.json:25-29`)
- Used for cross-directory imports; relative imports used within the same directory (`./DiffViewer`, `./types`)

## Error Handling

**Patterns:**
- API route handlers wrap logic in `try`/`catch` and return `NextResponse.json({ error }, { status })` — see `src/app/api/compare/route.ts:86-95`, `src/app/api/sitemap/route.ts:14-19`, `src/app/api/runs/[id]/route.ts:24-29`, `src/app/api/image/[...path]/route.ts:20-22`
- Validation precedes work; missing fields return `400` — `src/app/api/compare/route.ts:12-17`, `src/app/api/sitemap/route.ts:7-9`
- Missing resources return `404` — `src/app/api/runs/[id]/route.ts:11-13`
- Unknown errors normalized via `error instanceof Error ? error.message : 'Unknown error'` — `src/app/api/compare/route.ts:92`, `src/app/api/sitemap/route.ts:16`
- Bare `catch {}` (no binding) for predictable filesystem absence — `src/lib/storage.ts:25`, `src/lib/storage.ts:41`, `src/app/api/image/[...path]/route.ts:20`, `src/app/api/runs/[id]/route.ts:27`
- Per-page screenshot failures captured into `Map<string, string | Error>` rather than thrown, allowing partial-success runs — `src/lib/screenshotter.ts:96-101`
- Failed runs persist `status: 'failed'` to disk before returning — `src/app/api/compare/route.ts:87-89`
- Browser cleanup in both success and failure branches via explicit `closeBrowser()` calls — `src/app/api/compare/route.ts:83`, `src/app/api/compare/route.ts:89` (no `finally` block)
- Resource cleanup uses `try`/`finally` in screenshotter — `src/lib/screenshotter.ts:34-66`
- Client-side errors surfaced via `setError(string)` and rendered inline — `src/components/CompareForm.tsx:44`, `src/components/CompareForm.tsx:197-201`
- Specific recovery: SSL fallback from `https://` to `http://` in `src/lib/screenshotter.ts:39-50`

## Logging

**Framework:** None — `console.warn` used directly in one location

**Patterns:**
- `console.warn` for non-fatal degraded behavior — `src/lib/sitemap.ts:46` (sitemap-index unsupported)
- No structured logging, no log levels, no log aggregator
- Errors propagate to callers or return paths rather than being logged

## Comments

**When to Comment:**
- Section dividers in JSX with `{/* Header */}`, `{/* Tabs */}`, `{/* Content */}`, `{/* Summary bar */}`, `{/* Grid */}`, `{/* Modal */}` — `src/components/DiffViewer.tsx`, `src/components/ResultsGrid.tsx`
- Intent comments for non-obvious logic — `// Use larger dimensions for comparison` (`src/lib/differ.ts:28`), `// Pad images if needed` (`src/lib/differ.ts:32`), `// Less than 0.05% is considered a match (anti-aliasing noise)` (`src/lib/differ.ts:77`)
- Behavior notes for branching — `// URL params take priority (from "Run Again")` (`src/components/CompareForm.tsx:53`), `// Fall back to localStorage` (`src/components/CompareForm.tsx:58`), `// Try original URL first, fall back to http if https fails` (`src/lib/screenshotter.ts:36`)
- Channel labels in image buffer loops — `// R`, `// G`, `// B`, `// A` (`src/lib/differ.ts:64-67`)

**JSDoc/TSDoc:**
- Not used anywhere in the codebase

## Function Design

**Size:**
- Library functions stay focused (< 80 lines) — `diffImages` is ~40 lines, `takeScreenshot` is ~45 lines
- API route handlers contain end-to-end orchestration and run longer (~90 lines for `POST /api/compare`)

**Parameters:**
- Positional params for ≤3 args — `diffImages(imgPathA, imgPathB, diffOutputPath, threshold = 0.1)` (`src/lib/differ.ts:12`)
- Default values inline in signature — `threshold: number = 0.1`
- Optional progress/event callbacks last and optional — `onProgress?: (slug: string, index: number) => void` (`src/lib/screenshotter.ts:84`)
- React components destructure a single `Props` object — `function DiffViewer({ runId, slug, result, baseUrlA, baseUrlB, onClose }: Props)` (`src/components/DiffViewer.tsx:17`)
- Next.js route handlers receive `({ params }: { params: Promise<{ id: string }> })` and `await params` — `src/app/api/runs/[id]/route.ts:5-8`, `src/app/api/image/[...path]/route.ts:5-8`, `src/app/runs/[id]/page.tsx:8-12`

**Return Values:**
- Async functions return typed `Promise<T>` explicitly — e.g., `Promise<string>`, `Promise<ComparisonRun | null>`, `Promise<Map<string, string | Error>>`
- Discriminated-union pattern via `string | Error` Map values rather than throwing — `src/lib/screenshotter.ts:85`
- React components return JSX directly; no fragment wrappers when a single root suffices

## Module Design

**Exports:**
- Named exports for utilities — `export async function fetchSitemap`, `export function parseSitemap`, `export async function diffImages`, `export function determineStatus`
- `export default` reserved for React components and Next.js page/route conventions — `export default function Home`, `export default function CompareForm`, `export default function RunPage`
- Types/interfaces exported alongside functions in the same module — `export interface DiffResult` (`src/lib/differ.ts:6`), `export interface ComparisonConfig` (`src/lib/types.ts:1`)
- `export const DEFAULT_CONFIG` for shared constants — `src/lib/types.ts:28`

**Barrel Files:**
- Not used. No `index.ts` re-export modules in `src/lib/` or `src/components/`. Imports target concrete files (`@/lib/storage`, `@/lib/types`, `@/components/CompareForm`)

## React / Next.js Patterns

- Server Components by default; `'use client'` directive only on interactive components — `src/components/CompareForm.tsx:1`, `src/components/ResultsGrid.tsx:1`, `src/components/DiffViewer.tsx:1`
- `export const dynamic = 'force-dynamic'` on pages that read filesystem state — `src/app/page.tsx:6`, `src/app/runs/[id]/page.tsx:6`
- Async Server Components await data inline — `const runs = await listRuns()` (`src/app/page.tsx:9`)
- `Suspense` boundary wraps client components needing search params — `src/app/page.tsx:18-20`
- `useRouter` / `useSearchParams` from `next/navigation` for client-side routing
- `Link` from `next/link` for internal navigation
- Tailwind utility classes inline in `className`; no CSS modules; single global `src/app/globals.css` with `@import "tailwindcss"`
- LocalStorage access guarded with `typeof window === 'undefined'` checks — `src/components/CompareForm.tsx:16`, `src/components/CompareForm.tsx:26`

---

*Convention analysis: 2026-04-27*
