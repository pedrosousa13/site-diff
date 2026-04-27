# External Integrations

**Analysis Date:** 2026-04-27

## APIs & External Services

**Browser Automation:**
- Playwright (Chromium) - Launches headless browser to capture screenshots of arbitrary user-supplied URLs
  - SDK/Client: `playwright` ^1.58.1 (`src/lib/screenshotter.ts`)
  - Auth: none (local browser process)
  - Launch flags: `--ignore-certificate-errors`; contexts use `ignoreHTTPSErrors: true`
  - Navigation: `waitUntil: 'networkidle'`, `timeout: 30000`; auto-fallback from `https://` to `http://` on SSL errors

**User-supplied HTTP targets:**
- Arbitrary websites under comparison - The app fetches sitemaps and screenshots whatever URLs the user provides
  - Sitemap fetch: native `fetch()` in `src/lib/sitemap.ts` (`fetchSitemap`)
  - Page rendering: Playwright `page.goto()` in `src/lib/screenshotter.ts`
  - Auth: none

## Data Storage

**Databases:**
- None. No ORM, no DB client, no SQL/NoSQL driver in dependencies.

**File Storage:**
- Local filesystem only
  - Root: `data/runs/` under `process.cwd()` (`src/lib/storage.ts` `DATA_DIR`)
  - Per-run layout: `data/runs/<runId>/{meta.json, screenshots/a/, screenshots/b/, diffs/}`
  - Run ID format: `YYYY-MM-DD-<nanoid(8)>` (`src/app/api/compare/route.ts`)
  - Image serving: `src/app/api/image/[...path]/route.ts` (reads PNGs and returns with `Cache-Control: public, max-age=31536000`)
  - Persistence in Docker via bind mount `./data:/app/data` (`docker-compose.yml`)

**Caching:**
- None server-side
- HTTP `Cache-Control: public, max-age=31536000` on served images (`src/app/api/image/[...path]/route.ts`)
- Browser-side `localStorage` for form input persistence (`src/components/CompareForm.tsx`, per `README.md`)

## Authentication & Identity

**Auth Provider:**
- None. App is unauthenticated; all routes are public.
- `README.md` recommends fronting with reverse proxy (nginx/traefik) for production SSL.

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- `console.warn` in `src/lib/sitemap.ts` for unsupported sitemap index
- API routes return error JSON with HTTP status codes (`400`, `404`, `500`); no structured logging

## CI/CD & Deployment

**Hosting:**
- Self-hosted via Docker (`Dockerfile`, `docker-compose.yml`)
- Base image: `mcr.microsoft.com/playwright:v1.40.0-jammy` (pre-installed Chromium)
- Build: `npm ci` then `npm run build`
- Run: `npm start` (serves on port 3333 inside container; Dockerfile `EXPOSE 3000` and compose maps `3000:3000` — port mismatch, see CONCERNS)

**CI Pipeline:**
- None detected (no `.github/workflows/`, no `.gitlab-ci.yml`, no other CI config)

## Environment Configuration

**Required env vars:**
- None. No `process.env.*` references in `src/`.
- No `.env` / `.env.*` files in repo.

**Secrets location:**
- Not applicable (no secrets used)

## Webhooks & Callbacks

**Incoming HTTP Endpoints (Next.js route handlers):**
- `POST /api/compare` (`src/app/api/compare/route.ts`) - Triggers screenshot + diff run; body `{ baseUrlA, baseUrlB, slugs, config? }`
- `GET /api/sitemap?url=<sitemapUrl>` (`src/app/api/sitemap/route.ts`) - Fetches and parses remote sitemap.xml
- `GET /api/runs` (`src/app/api/runs/route.ts`) - Lists all stored runs
- `GET /api/runs/[id]` (`src/app/api/runs/[id]/route.ts`) - Returns single run metadata
- `DELETE /api/runs/[id]` (`src/app/api/runs/[id]/route.ts`) - Deletes run directory
- `GET /api/image/[...path]` (`src/app/api/image/[...path]/route.ts`) - Serves PNGs from `data/runs/`

**Outgoing HTTP:**
- `fetch(sitemapUrl)` to user-supplied sitemap URL (`src/lib/sitemap.ts`)
- `page.goto(url)` to user-supplied page URLs via Playwright (`src/lib/screenshotter.ts`)

**Webhooks:**
- None (no inbound or outbound webhook integrations)

---

*Integration audit: 2026-04-27*
