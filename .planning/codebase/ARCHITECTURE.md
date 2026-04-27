<!-- refreshed: 2026-04-27 -->
# Architecture

**Analysis Date:** 2026-04-27

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                          │
├──────────────────┬──────────────────┬───────────────────────┤
│   CompareForm    │   ResultsGrid    │     DiffViewer        │
│ `src/components/ │ `src/components/ │  `src/components/     │
│  CompareForm.tsx`│  ResultsGrid.tsx`│   DiffViewer.tsx`     │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │ fetch()          │ <img src=...>      │ <img src=...>
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                Next.js App Router (Server)                   │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  page.tsx    │ runs/[id]/   │ api/compare  │ api/sitemap    │
│              │ page.tsx     │ api/runs     │ api/image      │
│ `src/app/`   │ (RSC)        │ (route.ts)   │ (route.ts)     │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │              │              │                │
       ▼              ▼              ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                      Domain Library                          │
│  screenshotter.ts  │  differ.ts  │  sitemap.ts  │ storage.ts │
│        `src/lib/`                                            │
└──────┬─────────────┴──────┬───────┴──────┬───────┴─────┬────┘
       │                    │              │              │
       ▼                    ▼              ▼              ▼
┌──────────────┐    ┌──────────────┐  ┌──────────┐  ┌─────────────┐
│  Playwright  │    │ pixelmatch + │  │ External │  │ Filesystem  │
│  (Chromium)  │    │    pngjs     │  │ Sitemap  │  │ `data/runs/`│
└──────────────┘    └──────────────┘  └──────────┘  └─────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Home page | Render new comparison form + past runs list (RSC) | `src/app/page.tsx` |
| Run page | Render results for a specific run (RSC) | `src/app/runs/[id]/page.tsx` |
| Root layout | HTML shell, global CSS, page metadata | `src/app/layout.tsx` |
| CompareForm | URL/slug input, sitemap fetch, POST to `/api/compare` | `src/components/CompareForm.tsx` |
| ResultsGrid | Status summary + thumbnail grid, opens DiffViewer modal | `src/components/ResultsGrid.tsx` |
| DiffViewer | Side-by-side / diff / slider modal viewer | `src/components/DiffViewer.tsx` |
| Compare API | Orchestrates screenshot + diff for a run | `src/app/api/compare/route.ts` |
| Sitemap API | Proxies external sitemap.xml fetch + parse | `src/app/api/sitemap/route.ts` |
| Runs API | List runs / fetch one / delete one | `src/app/api/runs/route.ts`, `src/app/api/runs/[id]/route.ts` |
| Image API | Stream PNG bytes from `data/runs/` to client | `src/app/api/image/[...path]/route.ts` |
| Screenshotter | Singleton Chromium, full-page screenshots, SSL fallback | `src/lib/screenshotter.ts` |
| Differ | Pixel diff via `pixelmatch`, image padding, status calc | `src/lib/differ.ts` |
| Sitemap parser | XML parse + URL→slug normalization | `src/lib/sitemap.ts` |
| Storage | Run dir layout, metadata JSON, path helpers | `src/lib/storage.ts` |
| Types | Shared interfaces + `DEFAULT_CONFIG` | `src/lib/types.ts` |

## Pattern Overview

**Overall:** Next.js App Router monolith with synchronous request-blocking job execution and filesystem-backed persistence.

**Key Characteristics:**
- Server Components fetch data directly via `src/lib/storage.ts` (no client API calls for reads on initial render).
- Route Handlers (`route.ts`) act as the only mutation surface and the only path for Playwright execution.
- No database — JSON metadata + PNG files under `data/runs/<id>/`.
- Singleton Chromium browser kept alive across requests (`let browser` module-level in `src/lib/screenshotter.ts`).
- Path alias `@/*` → `src/*` (`tsconfig.json:25-29`) used everywhere.

## Layers

**App / Pages (RSC):**
- Purpose: Server-rendered HTML, reads run metadata directly from disk.
- Location: `src/app/page.tsx`, `src/app/runs/[id]/page.tsx`, `src/app/layout.tsx`
- Contains: Async server components, links, `Suspense` boundary around client form.
- Depends on: `src/lib/storage.ts`, `src/components/*`
- Used by: Browser via Next.js routing.

**Client Components:**
- Purpose: Interactive UI (form state, modal, slider, fetch calls).
- Location: `src/components/*.tsx` (all `'use client'`).
- Contains: `useState`, `useEffect`, `useRouter`, `useSearchParams`, mouse handlers.
- Depends on: `src/lib/types.ts` (types only), `/api/*` endpoints via `fetch`.
- Used by: RSC pages.

**API Route Handlers:**
- Purpose: HTTP boundary for mutations, image streaming, sitemap proxy.
- Location: `src/app/api/**/route.ts`
- Contains: `POST`/`GET`/`DELETE` exports, request validation, orchestration.
- Depends on: `src/lib/*`
- Used by: Client components via `fetch`.

**Domain Library:**
- Purpose: Pure(ish) business logic — screenshots, diffing, parsing, file IO.
- Location: `src/lib/*.ts`
- Contains: No React, no Next.js request types (except none); plain async functions.
- Depends on: `playwright`, `pixelmatch`, `pngjs`, `fast-xml-parser`, `node:fs`.
- Used by: Route handlers and RSC pages.

## Data Flow

### Primary Request Path — Run a comparison

1. User submits form → `handleSubmit` POSTs `{ baseUrlA, baseUrlB, slugs }` (`src/components/CompareForm.tsx:99-128`).
2. `POST /api/compare` validates body and builds `runId = YYYY-MM-DD-<nanoid8>` (`src/app/api/compare/route.ts:8-26`).
3. `ensureRunDir` creates `data/runs/<id>/{screenshots/a,screenshots/b,diffs}` (`src/lib/storage.ts:7-13`).
4. Initial `meta.json` written with `status: 'running'` (`src/app/api/compare/route.ts:39-40`).
5. `screenshotPages` runs in parallel for both base URLs via `Promise.all` (`src/app/api/compare/route.ts:43-46`); inside, slugs are processed sequentially per side (`src/lib/screenshotter.ts:88-104`).
6. Each slug's screenshot uses singleton browser, new context per page, `networkidle` wait, optional selector hide, optional delay, full-page PNG (`src/lib/screenshotter.ts:22-67`). HTTPS errors auto-retry over HTTP (`:39-49`).
7. For every slug, `diffImages` reads both PNGs, pads to max(W,H) with white, runs `pixelmatch`, writes diff PNG (`src/lib/differ.ts:12-53`).
8. `determineStatus` flags `< 0.05%` mismatch as `'match'`, otherwise `'diff'` (`src/lib/differ.ts:76-79`).
9. Final `meta.json` written with `status: 'completed'`, browser closed, JSON response returned (`src/app/api/compare/route.ts:80-85`).
10. Client `router.push('/runs/<id>')` navigates to results (`src/components/CompareForm.tsx:122`).

### Secondary Flow — View past run

1. `GET /runs/[id]` RSC awaits `getMetadata(id)` from disk (`src/app/runs/[id]/page.tsx:14`).
2. `notFound()` if missing; otherwise renders `<ResultsGrid>` with full `run` (`src/app/runs/[id]/page.tsx:16-46`).
3. Each `ResultCard` builds `/api/image/<runId>/diffs/<filename>.png` URL (`src/components/ResultsGrid.tsx:74-75`).
4. Image route streams bytes from `data/runs/<...>` with one-year cache header (`src/app/api/image/[...path]/route.ts:10-19`).
5. Click opens `DiffViewer` modal which fetches A/B/diff images by the same convention (`src/components/DiffViewer.tsx:39-42`).

### Secondary Flow — Fetch from sitemap

1. `Fetch` button hits `/api/sitemap?url=...` (`src/components/CompareForm.tsx:82`).
2. Server `fetch`es XML, parses with `fast-xml-parser`, normalizes `loc` → pathname (`src/lib/sitemap.ts:9-67`).
3. First 10 slugs are placed into the textarea (`src/components/CompareForm.tsx:89-90`).

**State Management:**
- Server-side: filesystem only (`data/runs/<id>/meta.json`).
- Client-side: component `useState`; form persisted to `localStorage` under key `'site-diff-form'` (`src/components/CompareForm.tsx:6,15-30,71-74`).
- URL params (`baseUrlA`, `baseUrlB`, `slugs`) override localStorage on mount for the "Run Again" deep link (`src/components/CompareForm.tsx:47-68`, `src/app/runs/[id]/page.tsx:38-43`).

## Key Abstractions

**ComparisonRun:**
- Purpose: Single source of truth for a run, serialized as JSON.
- Examples: `data/runs/<id>/meta.json`
- Pattern: Plain interface in `src/lib/types.ts:18-26`; built once, mutated locally, persisted via `saveMetadata`.

**PageResult:**
- Purpose: Per-slug outcome (match | diff | error) with metrics.
- Examples: `src/lib/types.ts:9-16`
- Pattern: Status enum derived from `mismatchPercent` threshold.

**ComparisonConfig + DEFAULT_CONFIG:**
- Purpose: Tunable comparison knobs (viewport, fullPage, delay, threshold, hideSelectors).
- Examples: `src/lib/types.ts:1-7,28-33`
- Pattern: Defaults merged with caller overrides in `src/app/api/compare/route.ts:20-26`.

**Run ID:**
- Purpose: Stable identifier and on-disk directory name.
- Format: `YYYY-MM-DD-<nanoid(8)>` (`src/app/api/compare/route.ts:19`).
- Pattern: Date prefix enables natural chronological sort in directory listings.

**Slug → filename:**
- Purpose: Map URL paths to safe PNG filenames.
- Rule: `/` → `home.png`; otherwise strip leading `/`, replace `/` with `-`, append `.png`.
- Examples: Implemented in `src/lib/storage.ts:61-64`, mirrored inline in `src/lib/screenshotter.ts:91`, `src/components/ResultsGrid.tsx:74`, `src/components/DiffViewer.tsx:39`.

## Entry Points

**Next.js dev/start server:**
- Location: `package.json:6-9` (`next dev -p 3333`, `next start -p 3333`).
- Triggers: `npm run dev` / `npm start`.
- Responsibilities: Boots App Router, serves RSC + API routes.

**Docker container:**
- Location: `Dockerfile`, `docker-compose.yml`.
- Triggers: `docker compose up`.
- Responsibilities: Microsoft Playwright base image, mounts `./data` volume, exposes port 3000.

**Browser route entry:**
- Location: `src/app/page.tsx`.
- Triggers: User visits `/`.
- Responsibilities: List past runs, render `<CompareForm>`.

**HTTP API entries:**
- `POST /api/compare` — start a run.
- `GET /api/sitemap?url=` — fetch external sitemap.
- `GET /api/runs` — list runs.
- `GET|DELETE /api/runs/[id]` — fetch / delete one run.
- `GET /api/image/[...path]` — stream PNG from `data/runs/`.

## Architectural Constraints

- **Threading:** Single Node.js event loop. Both sides screenshot concurrently via `Promise.all`, but slugs within a side are sequential (`src/lib/screenshotter.ts:88`).
- **Global state:** Module-level `browser: Browser | null` singleton in `src/lib/screenshotter.ts:4`. `closeBrowser()` is the only teardown.
- **Blocking requests:** `POST /api/compare` blocks until the entire run finishes — no background queue, no progress streaming. Long runs will hit Next.js / proxy timeouts.
- **Filesystem coupling:** `process.cwd()/data/runs` is hardcoded (`src/lib/storage.ts:5`, `src/app/api/image/[...path]/route.ts:10`). Container must bind-mount or persist this path.
- **Path traversal surface:** `/api/image/[...path]` joins user-provided segments directly into the runs path with no normalization (`src/app/api/image/[...path]/route.ts:10`).
- **Sitemap index unsupported:** `parseSitemap` only handles `urlset`; `sitemapindex` is logged and ignored (`src/lib/sitemap.ts:43-47`).
- **Slug→filename collision:** Two distinct slugs that normalize identically (e.g. `/a/b` and `/a-b`) overwrite each other.
- **Server-only deps:** `playwright` is declared in `serverExternalPackages` (`next.config.ts:4`); never import from client components.

## Anti-Patterns

### Duplicated slug→filename logic

**What happens:** The same `slug === '/' ? 'home.png' : slug.replace(/^\//,'').replace(/\//g,'-') + '.png'` formula is reimplemented in 4 places.
**Why it's wrong:** Any change (e.g., URL encoding, collision handling) must be made identically in `src/lib/storage.ts:61-64`, `src/lib/screenshotter.ts:91`, `src/components/ResultsGrid.tsx:74`, and `src/components/DiffViewer.tsx:39`.
**Do this instead:** Export `slugToFilename` from `src/lib/storage.ts` and import it in components and screenshotter.

### Synchronous long-running POST

**What happens:** `POST /api/compare` performs N×2 screenshots + N diffs inside the request lifecycle (`src/app/api/compare/route.ts:38-85`).
**Why it's wrong:** Connections time out for medium runs; client has no progress; failure mid-run leaves `status: 'running'` stuck.
**Do this instead:** Kick off the job, persist `runId`, respond immediately, and have the client poll `GET /api/runs/[id]` (the `status` field already supports `'running' | 'completed' | 'failed'`).

### Unvalidated path parameter in image route

**What happens:** `path.join(process.cwd(), 'data', 'runs', ...pathSegments)` with raw segments (`src/app/api/image/[...path]/route.ts:10`).
**Why it's wrong:** `..` segments could escape the runs directory.
**Do this instead:** Resolve and assert the final path stays under `data/runs/`, and reject non-`.png` extensions.

### Dead `error` field for `error` PageResult

**What happens:** When one side errors, the result is pushed with the other side's error message accessed via cross-cast (`src/app/api/compare/route.ts:54-63`); no diff PNG is generated, but `ResultCard` still computes a `diffUrl` for non-error statuses only — fine — yet the message-extraction casts `pathB as Error` even when it's a string.
**Why it's wrong:** Logic relies on subtle ternary fall-through; easy to misread.
**Do this instead:** Compute `errA`/`errB` once with explicit `instanceof Error` checks, then assign.

## Error Handling

**Strategy:** Try/catch at each boundary; persist failure into `meta.json` and return JSON `{ error }` to clients.

**Patterns:**
- API handlers return `NextResponse.json({ error }, { status })` on validation/runtime failure (e.g., `src/app/api/compare/route.ts:13-17,86-95`).
- `screenshotPages` collects per-slug errors into a `Map<string, string | Error>` instead of throwing, so one failed slug doesn't kill the run (`src/lib/screenshotter.ts:96-101`).
- SSL failures auto-retry over HTTP (`src/lib/screenshotter.ts:39-49`).
- Storage reads swallow all errors and return `null`/`[]` (`src/lib/storage.ts:20-44`).
- Client surfaces server `error` strings into a red banner; never throws to the boundary.

## Cross-Cutting Concerns

**Logging:** `console.warn` only (e.g., `src/lib/sitemap.ts:46`). No structured logger, no request IDs.

**Validation:** Manual presence checks in route handlers (`src/app/api/compare/route.ts:12-17`). No schema library.

**Authentication:** None. All routes are public.

**Caching:** `Cache-Control: public, max-age=31536000` on streamed PNGs (`src/app/api/image/[...path]/route.ts:16`); pages use `export const dynamic = 'force-dynamic'` (`src/app/page.tsx:6`, `src/app/runs/[id]/page.tsx:7`).

**Styling:** Tailwind v4 via PostCSS (`postcss.config.mjs`, `src/app/globals.css`).

---

*Architecture analysis: 2026-04-27*
