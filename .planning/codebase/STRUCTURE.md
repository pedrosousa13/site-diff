# Codebase Structure

**Analysis Date:** 2026-04-27

## Directory Layout

```
site-diff/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root HTML + metadata
│   │   ├── page.tsx                  # Home (form + past runs)
│   │   ├── globals.css               # Tailwind entry
│   │   ├── runs/
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Run results view (RSC)
│   │   └── api/
│   │       ├── compare/
│   │       │   └── route.ts          # POST: run comparison
│   │       ├── sitemap/
│   │       │   └── route.ts          # GET: fetch+parse sitemap
│   │       ├── runs/
│   │       │   ├── route.ts          # GET: list runs
│   │       │   └── [id]/
│   │       │       └── route.ts      # GET/DELETE: single run
│   │       └── image/
│   │           └── [...path]/
│   │               └── route.ts      # GET: stream PNG bytes
│   ├── components/                   # All `'use client'`
│   │   ├── CompareForm.tsx
│   │   ├── ResultsGrid.tsx
│   │   └── DiffViewer.tsx
│   └── lib/                          # Domain library (server-side)
│       ├── types.ts                  # Shared interfaces + DEFAULT_CONFIG
│       ├── storage.ts                # Filesystem run layout
│       ├── screenshotter.ts          # Playwright wrapper
│       ├── differ.ts                 # pixelmatch + pngjs
│       └── sitemap.ts                # XML → slugs
├── data/
│   └── runs/                         # Gitignored, persisted artifacts
│       └── <YYYY-MM-DD-nanoid>/
│           ├── meta.json
│           ├── screenshots/
│           │   ├── a/<slug>.png
│           │   └── b/<slug>.png
│           └── diffs/<slug>.png
├── .planning/
│   └── codebase/                     # GSD analysis docs
├── Dockerfile                        # Playwright base image
├── docker-compose.yml                # Mounts ./data, exposes :3000
├── next.config.ts                    # serverExternalPackages: ['playwright']
├── postcss.config.mjs                # Tailwind v4
├── tsconfig.json                     # `@/*` → `./src/*`
├── package.json                      # scripts: dev/build/start/lint on :3333
├── README.md
└── .gitignore                        # node_modules, .next, data/, *.tsbuildinfo
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router routes — both RSC pages and API route handlers.
- Contains: `page.tsx` (server components), `route.ts` (handlers), `layout.tsx`, `globals.css`.
- Key files: `src/app/page.tsx`, `src/app/api/compare/route.ts`.

**`src/app/api/`:**
- Purpose: HTTP route handlers.
- Convention: One folder per resource, dynamic segments use `[id]` or `[...path]`.
- Key files: `src/app/api/compare/route.ts`, `src/app/api/image/[...path]/route.ts`.

**`src/components/`:**
- Purpose: Client components only — every file starts with `'use client'`.
- Contains: Stateful UI (forms, modals, sliders).
- Key files: `src/components/CompareForm.tsx`, `src/components/DiffViewer.tsx`.

**`src/lib/`:**
- Purpose: Server-side domain logic. No React. Imports allowed from `node:fs`, `playwright`, `pixelmatch`, etc.
- Contains: Pure-ish async functions and shared types.
- Key files: `src/lib/types.ts`, `src/lib/storage.ts`, `src/lib/screenshotter.ts`, `src/lib/differ.ts`, `src/lib/sitemap.ts`.

**`data/runs/`:**
- Purpose: Persistent run artifacts (metadata + PNGs).
- Generated: Yes — written by `src/lib/storage.ts` + `src/lib/screenshotter.ts` + `src/lib/differ.ts`.
- Committed: No (`.gitignore:3`).

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents.
- Generated: Yes (this directory).
- Committed: Per project policy.

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: HTML shell.
- `src/app/page.tsx`: `/` route.
- `src/app/runs/[id]/page.tsx`: `/runs/<id>` route.
- `src/app/api/compare/route.ts`: comparison kickoff.

**Configuration:**
- `next.config.ts`: declares `playwright` as external server package.
- `tsconfig.json`: strict mode, `@/*` alias.
- `postcss.config.mjs`: Tailwind v4 plugin.
- `package.json`: dev/start on port 3333.
- `Dockerfile` + `docker-compose.yml`: container build, exposes 3000, mounts `./data`.

**Core Logic:**
- `src/lib/screenshotter.ts`: Chromium singleton, full-page screenshots, SSL fallback.
- `src/lib/differ.ts`: pixel diff, image padding, status threshold (`< 0.05%` = match).
- `src/lib/storage.ts`: run directory layout, metadata JSON, slug→filename mapping.
- `src/lib/sitemap.ts`: `fast-xml-parser` + URL→slug normalization.
- `src/lib/types.ts`: `ComparisonRun`, `PageResult`, `ComparisonConfig`, `DEFAULT_CONFIG`.

**Testing:**
- None present — no test framework, no test files, no test script in `package.json`.

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `CompareForm.tsx`, `DiffViewer.tsx`).
- Library modules: `lowercase.ts` (e.g., `screenshotter.ts`, `differ.ts`).
- Next.js framework files: lowercase reserved names (`page.tsx`, `layout.tsx`, `route.ts`, `globals.css`).
- No `index.ts` barrels.

**Directories:**
- App Router segments: `lowercase` (e.g., `runs`, `compare`).
- Dynamic segments: bracketed (`[id]`, `[...path]`).
- Source roots: `src/{app,components,lib}`.

**Code identifiers:**
- Functions/variables: `camelCase` (`takeScreenshot`, `runId`, `loadFromStorage`).
- Types/interfaces: `PascalCase` (`ComparisonRun`, `PageResult`, `DiffResult`, `ViewMode`).
- Constants: `UPPER_SNAKE_CASE` (`DATA_DIR`, `STORAGE_KEY`, `DEFAULT_CONFIG`).
- React components: `PascalCase` exported as `default`.

**Imports:**
- Path alias `@/*` for everything under `src/` (e.g., `import { ... } from '@/lib/storage'`).
- Type-only imports use `import type { ... }` (e.g., `src/lib/differ.ts:4`).
- Relative imports only used between sibling components (e.g., `import DiffViewer from './DiffViewer'`).

**Run IDs:**
- Format: `YYYY-MM-DD-<nanoid(8)>` (`src/app/api/compare/route.ts:19`).

**Slug → filename:**
- `/` → `home.png`.
- Otherwise strip leading `/`, replace `/` with `-`, append `.png`.
- Implementation: `src/lib/storage.ts:61-64` (canonical), duplicated inline in 3 other files.

## Where to Add New Code

**New API endpoint:**
- Create `src/app/api/<resource>/route.ts` exporting `GET`/`POST`/etc.
- For dynamic params, add `[id]` subfolder; await `params` Promise per Next.js 16 convention (see `src/app/api/runs/[id]/route.ts:5-9`).

**New page:**
- Create `src/app/<segment>/page.tsx` as default-exported `async` RSC.
- Add `export const dynamic = 'force-dynamic'` if reading from `data/runs/` (matches existing pages).

**New client component:**
- Place in `src/components/PascalName.tsx`.
- First line: `'use client'`.
- Import shared types from `@/lib/types` with `import type`.

**New domain logic:**
- Place in `src/lib/<feature>.ts` as plain async functions.
- Re-export shared types from `src/lib/types.ts`.
- Avoid importing from `next/*` here — keep this layer framework-agnostic.

**New shared type:**
- Add to `src/lib/types.ts`. There is currently one types module; resist creating per-feature type files until it grows.

**New persisted artifact for a run:**
- Add a directory under `ensureRunDir` in `src/lib/storage.ts:7-13` and a path helper alongside `getScreenshotPath` / `getDiffPath`.

**New configuration option:**
- Extend `ComparisonConfig` in `src/lib/types.ts:1-7`.
- Add a default to `DEFAULT_CONFIG` (`src/lib/types.ts:28-33`).
- Wire it in `src/app/api/compare/route.ts:20-26` and consume it in `src/lib/screenshotter.ts` or `src/lib/differ.ts`.

**New external dependency:**
- If it's server-only and bundles poorly (like `playwright`), add to `serverExternalPackages` in `next.config.ts:4`.

## Special Directories

**`data/runs/`:**
- Purpose: Per-run filesystem store (`meta.json`, `screenshots/{a,b}/*.png`, `diffs/*.png`).
- Generated: Yes (runtime).
- Committed: No.
- Docker: Bind-mounted from host via `docker-compose.yml`.

**`.next/`:**
- Purpose: Next.js build output.
- Generated: Yes.
- Committed: No.

**`node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes.
- Committed: No.

**`.claude/`:**
- Purpose: Claude Code agent configuration (untracked).
- Generated: Manual.
- Committed: Per agent policy.

**`.planning/`:**
- Purpose: GSD planning + codebase analysis output.
- Generated: By GSD commands.

---

*Structure analysis: 2026-04-27*
