# Testing Patterns

**Analysis Date:** 2026-04-27

## Test Framework

**Runner:**
- None configured. No test framework declared in `package.json` (`dependencies` and `devDependencies` contain no Jest, Vitest, Mocha, Playwright Test, Cypress, or Testing Library packages).
- No test config files present (`jest.config.*`, `vitest.config.*`, `playwright.config.*` all absent).
- No `test` script in `package.json:5-10`. Available scripts: `dev`, `build`, `start`, `lint`.

**Assertion Library:**
- Not applicable.

**Run Commands:**
```bash
# No tests configured. To add tests, install a runner first.
# Example (Vitest, the typical Next.js 16 + React 19 choice):
#   npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
#   then add: "test": "vitest" to package.json scripts
```

## Test File Organization

**Location:**
- No test files exist anywhere in the repo. `find src -name "*.test.*" -o -name "*.spec.*"` returns no results.
- No `__tests__/`, `tests/`, or `test/` directories.

**Naming:**
- No convention established. The recommended pattern for this stack would be co-located `*.test.ts` / `*.test.tsx` files next to source (e.g., `src/lib/differ.test.ts` next to `src/lib/differ.ts`).

**Structure:**
```
(no test directory exists)
```

## Test Structure

**Suite Organization:**
- No tests written. No idiomatic pattern to mirror.

**Patterns:**
- None established.

## Mocking

**Framework:** None.

**Patterns:**
- None established.

**What to Mock (recommended for this codebase if tests are added):**
- `playwright` browser launches in `src/lib/screenshotter.ts` — slow, requires Chromium binary; mock `chromium.launch` or extract a thin adapter.
- `fetch` in `src/lib/sitemap.ts:10` — network call; mock with `vi.stubGlobal('fetch', ...)` or MSW.
- `fs.promises` in `src/lib/storage.ts` and `src/app/api/image/[...path]/route.ts` — use a temp directory (`os.tmpdir()` + `mkdtemp`) instead of mocking, or mock `fs/promises`.
- `nanoid` in `src/app/api/compare/route.ts:19` — for deterministic run IDs in tests.

**What NOT to Mock:**
- `pixelmatch` and `pngjs` (`src/lib/differ.ts:2-3`) — pure, deterministic; use real fixtures.
- `fast-xml-parser` (`src/lib/sitemap.ts:1`) — pure parser; feed real XML strings.
- Pure helpers (`urlToSlug`, `slugToFilename`, `padImage`, `determineStatus`).

## Fixtures and Factories

**Test Data:**
- None established.

**Recommended fixture locations if tests are added:**
- Sitemap XML samples: `src/lib/__fixtures__/sitemap-*.xml`
- PNG pairs for diff testing: `src/lib/__fixtures__/diff/{a,b}/*.png`
- `ComparisonRun` builders: inline factory in test files using `DEFAULT_CONFIG` from `src/lib/types.ts:28`

## Coverage

**Requirements:** None enforced. No coverage tool configured.

**View Coverage:**
```bash
# Not configured.
```

## Test Types

**Unit Tests:**
- None. Highest-leverage targets if added:
  - `parseSitemap(xml, baseUrl)` in `src/lib/sitemap.ts:19` — pure, branchy (urlset vs sitemapindex, same-origin vs cross-origin), trivially testable.
  - `determineStatus(mismatchPercent)` in `src/lib/differ.ts:76` — pure threshold logic.
  - `slugToFilename` in `src/lib/storage.ts:61` and the duplicate inline logic in `src/lib/screenshotter.ts:91`, `src/components/ResultsGrid.tsx:74`, `src/components/DiffViewer.tsx:39` — mismatched implementations are a known smell worth pinning behavior on.
  - `urlToSlug` in `src/lib/sitemap.ts:52`.

**Integration Tests:**
- None. Candidates: `POST /api/compare` (`src/app/api/compare/route.ts`), `GET /api/sitemap` (`src/app/api/sitemap/route.ts`), `GET/DELETE /api/runs/[id]` (`src/app/api/runs/[id]/route.ts`) — all are pure handler functions invocable by constructing a `NextRequest`.

**E2E Tests:**
- None. `playwright` is present as a runtime dependency (`package.json:19`) for screenshot capture, NOT as a test runner. `@playwright/test` is not installed.

## Common Patterns

**Async Testing:**
- None established.

**Error Testing:**
- None established. Error paths worth covering when tests are added:
  - SSL fallback in `src/lib/screenshotter.ts:39-50`
  - Missing-field validation in `src/app/api/compare/route.ts:12-17`
  - 404 handling in `src/app/api/runs/[id]/route.ts:11-13` and `src/app/api/image/[...path]/route.ts:20-22`
  - Per-page error capture in the `Map<string, string | Error>` flow at `src/lib/screenshotter.ts:96-101` and downstream handling at `src/app/api/compare/route.ts:54-64`

## Manual Verification

The repo currently relies on manual verification via:
- `npm run dev` (port 3333, see `package.json:6`) and exercising the UI at `/`
- `docker-compose.yml` for containerized run
- Inspecting persisted run artifacts under `data/runs/<runId>/{meta.json,screenshots/,diffs/}` (see `src/lib/storage.ts:5`)

---

*Testing analysis: 2026-04-27*
