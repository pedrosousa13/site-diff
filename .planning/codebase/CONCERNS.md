# Codebase Concerns

**Analysis Date:** 2026-04-27

## Tech Debt

**No request validation / schema enforcement:**
- Issue: API route handlers parse JSON and read fields directly without schema validation (no Zod, valibot, etc.).
- Files: `src/app/api/compare/route.ts`, `src/app/api/sitemap/route.ts`, `src/app/api/runs/[id]/route.ts`
- Impact: Malformed bodies cause untyped runtime errors; `userConfig.viewport` is trusted as `{width,height}` with no shape check; `slugs` is checked only for `length` (could contain non-strings).
- Fix approach: Add a shared validation layer (e.g., Zod) for `POST /api/compare` body, `userConfig`, and query params.

**Sync filename derivation duplicated in three places:**
- Issue: `slug -> filename` mapping is reimplemented inline in `screenshotPages`, `ResultCard`, and `DiffViewer`, while `storage.ts` already exports a private `slugToFilename`.
- Files: `src/lib/screenshotter.ts:91`, `src/components/ResultsGrid.tsx:74`, `src/components/DiffViewer.tsx:39`, `src/lib/storage.ts:61-64`
- Impact: Any change to slug-to-filename rules (e.g., handling query strings, encoding, collisions) must be made in 4 places. Drift here would silently produce 404s on diff images.
- Fix approach: Export `slugToFilename` from `src/lib/storage.ts` (or a new `src/lib/slug.ts`) and consume it everywhere.

**Long-running comparisons block the request thread:**
- Issue: `POST /api/compare` performs all screenshots and diffs synchronously inside the request handler, then returns the full run.
- Files: `src/app/api/compare/route.ts:38-95`
- Impact: For large slug lists, the HTTP request can exceed proxy/edge timeouts (Vercel/serverless limits, nginx defaults). The browser shows a hung "Running..." state with no progress. There is no way to cancel.
- Fix approach: Kick off the run in the background, return `runId` immediately, and stream progress (SSE/polling on `GET /api/runs/[id]`). The `onProgress` hook already exists in `screenshotPages` but is never wired up.

**No in-flight run tracking:**
- Issue: A run is written with `status: 'running'`, but if the Node process restarts, the run stays `running` forever.
- Files: `src/app/api/compare/route.ts:34-36`, `src/lib/storage.ts:30-44`
- Impact: Past Runs list displays stale "running" entries with no recovery path.
- Fix approach: On startup, scan `data/runs/` and mark any `running` runs as `failed` with an "interrupted" reason.

**`force-dynamic` on every page:**
- Issue: `src/app/page.tsx` and `src/app/runs/[id]/page.tsx` both opt out of caching.
- Files: `src/app/page.tsx:6`, `src/app/runs/[id]/page.tsx:6`
- Impact: Acceptable for current single-user local-first design, but every page hit hits the FS. No impact today, but blocks any deployment with caching/CDN in front.
- Fix approach: When multi-user, switch to `revalidate` + tag-based invalidation on run mutations.

**Unused `Suspense` boundary parameter:**
- Issue: `src/app/page.tsx` imports `Suspense` and wraps `CompareForm` for `useSearchParams`, which is correct, but `CompareForm` itself does not signal suspense — it gates everything behind a `mounted` flag.
- Files: `src/app/page.tsx:1,18-20`, `src/components/CompareForm.tsx:35,67`
- Impact: Minor; the fallback is shown only on initial server render.
- Fix approach: Acceptable as-is, but document the pattern.

**No cleanup of large run artifacts:**
- Issue: Each run writes 3 PNGs per slug (A, B, diff). `fullPage` defaults to true, so screenshots can be many MB each. No retention policy.
- Files: `src/lib/storage.ts`, `src/app/api/compare/route.ts`
- Impact: `data/runs/` grows unbounded; will fill disk on long-lived deployments.
- Fix approach: Add retention (cron / size cap / oldest-N) and surface size in UI.

**Browser singleton lifecycle is brittle:**
- Issue: `browser` is a module-level singleton. `getBrowser` lazily launches; `closeBrowser` is called on every comparison's success and failure paths, which throws away warm browser state across runs.
- Files: `src/lib/screenshotter.ts:4-20`, `src/app/api/compare/route.ts:83,89`
- Impact: Each comparison pays a ~1-2s Chromium launch cost. Worse: in dev mode with HMR, the singleton may leak across reloads.
- Fix approach: Either (a) keep browser open across runs and close on process exit only, or (b) accept relaunch cost and document why.

## Known Bugs

**Unhandled `request.json()` failure:**
- Symptoms: Sending an empty/invalid JSON body to `POST /api/compare` will throw a 500 instead of a 400.
- Files: `src/app/api/compare/route.ts:9`
- Trigger: `curl -X POST /api/compare -d ''` or any malformed JSON.
- Workaround: Wrap `await request.json()` in try/catch and return 400 on parse error.

**Sitemap-index responses silently produce empty list:**
- Symptoms: User pastes a sitemap-index URL, sees `console.warn` only, gets `slugs: []` and an empty textarea — no UI error.
- Files: `src/lib/sitemap.ts:43-47`, `src/app/api/sitemap/route.ts`, `src/components/CompareForm.tsx:84-91`
- Trigger: Any nested `<sitemapindex>` document.
- Workaround: Either follow child sitemaps, or surface an explicit error to the client (e.g., `throw new Error('Sitemap index not supported')`).

**`urlToSlug` discards cross-origin URLs unexpectedly:**
- Symptoms: When a sitemap lists URLs on a different origin than the sitemap itself, only the pathname is kept, which is then resolved against `baseUrlA`/`baseUrlB`. For aggregator sitemaps, this yields wrong URLs.
- Files: `src/lib/sitemap.ts:52-67`
- Trigger: Sitemap whose `<loc>` differs in origin from the sitemap URL.
- Workaround: Document constraint or filter cross-origin entries explicitly.

**Slider `mousemove` listener leak on unmount:**
- Symptoms: If the modal closes while the user is dragging the slider, the document-level `mousemove`/`mouseup` listeners may not be removed (they are removed only on `mouseup`).
- Files: `src/components/DiffViewer.tsx:22-37`
- Trigger: Drag slider, then press Escape / close button mid-drag.
- Workaround: Add a cleanup `useEffect` that removes both listeners on unmount.

**`baseUrl` resolution drops sitemap origin:**
- Symptoms: `new URL(slug, baseUrl)` in `screenshotPages` assumes `slug` is path-only. If a `slug` ever contains a full URL (e.g., the cross-origin case above), the absolute URL wins and `baseUrl` is ignored.
- Files: `src/lib/screenshotter.ts:90`
- Trigger: Slug containing `https://...`.
- Workaround: Normalize/strip slugs to pathname before storing.

**Filename collisions on slugs that differ only by separator:**
- Symptoms: `/foo/bar` and `/foo-bar` both map to `foo-bar.png` and overwrite each other.
- Files: `src/lib/storage.ts:61-64`, `src/lib/screenshotter.ts:91`, `src/components/ResultsGrid.tsx:74`, `src/components/DiffViewer.tsx:39`
- Trigger: Any sitemap with both forms.
- Workaround: Hash the slug, or percent-encode `/` (e.g., `foo%2Fbar.png`).

**`Promise.all` aborts partial work on fatal browser error:**
- Symptoms: If Chromium crashes mid-run, both `screenshotPages` calls reject and the `catch` block marks the run failed without persisting any partial per-slug results.
- Files: `src/app/api/compare/route.ts:43-46,86-95`
- Trigger: OOM, container kill, or `chromium` crash.
- Workaround: Persist per-slug results incrementally as they complete.

**`PageResult.error` typed as optional but cast carelessly:**
- Symptoms: The ternary at line 61 has `(pathB as Error)` — both branches are already known to be `Error`s but the cast hides a logic flaw: it picks `pathA.message` even when only `pathB` errored if `pathA` happens to be an Error too.
- Files: `src/app/api/compare/route.ts:54-63`
- Trigger: Both A and B fail for the same slug.
- Workaround: Build a structured error capturing both sides: `{ a: pathA.message, b: pathB.message }`.

## Security Considerations

**SSRF via `/api/sitemap` and `/api/compare`:**
- Risk: Both endpoints `fetch`/navigate arbitrary user-supplied URLs from the server. An attacker can target `http://169.254.169.254/...` (cloud metadata), `http://localhost:.../`, internal services, or file-like URLs.
- Files: `src/lib/sitemap.ts:9-17`, `src/lib/screenshotter.ts:22-67`, `src/app/api/sitemap/route.ts`, `src/app/api/compare/route.ts`
- Current mitigation: None.
- Recommendations: For self-hosted-only / single-user deployments this is acceptable but must be documented. For any multi-tenant deployment, add an allowlist or block RFC1918 / link-local / metadata IPs before fetching.

**Path traversal in `/api/image/[...path]`:**
- Risk: The handler joins user-provided `pathSegments` with `data/runs/` using `path.join`. Segments containing `..` would resolve outside the intended directory. Next.js `[...path]` decoding may or may not allow `..` — needs verification.
- Files: `src/app/api/image/[...path]/route.ts:9-13`
- Current mitigation: None explicit.
- Recommendations: After joining, verify the resolved path starts with `path.resolve(process.cwd(), 'data', 'runs') + path.sep`. Reject otherwise.

**Path traversal in `getMetadata` / `deleteRun`:**
- Risk: `runId` from URL params is concatenated into a filesystem path with no validation. A request to `DELETE /api/runs/..%2Ffoo` could attempt to delete arbitrary directories.
- Files: `src/lib/storage.ts:20-49`, `src/app/api/runs/[id]/route.ts`
- Current mitigation: None.
- Recommendations: Validate `runId` matches `/^\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{8}$/` before any FS operation.

**`--ignore-certificate-errors` and `ignoreHTTPSErrors`:**
- Risk: Chromium is launched with cert validation disabled and contexts ignore HTTPS errors. Combined with auto-fallback from `https://` to `http://` on SSL errors (silent downgrade), this means the tool will happily screenshot MITM'd or downgraded pages.
- Files: `src/lib/screenshotter.ts:8-13,28-50`
- Current mitigation: Documented as a feature ("SSL error handling").
- Recommendations: Surface the downgrade in the UI/result, and gate it behind an explicit user opt-in.

**`hideSelectors` runs `page.evaluate` with user input:**
- Risk: `hideSelectors` strings flow into `document.querySelectorAll(sel)` inside the target page's context. The selector is sandboxed (no code injection), but a malicious selector could be expensive (catastrophic CSS selectors).
- Files: `src/lib/screenshotter.ts:69-77`
- Current mitigation: None.
- Recommendations: Add a length/complexity cap and document.

**No auth on any endpoint:**
- Risk: Self-hosted deployments expose all comparison results, including potentially sensitive screenshots of internal sites.
- Files: All under `src/app/api/`
- Current mitigation: README suggests "reverse proxy with SSL" but does not require auth.
- Recommendations: Document required external auth (basic auth in nginx/traefik) or add a simple shared-secret gate via env var.

**No rate limiting:**
- Risk: A loop hitting `POST /api/compare` will spawn unbounded Chromium contexts.
- Files: `src/app/api/compare/route.ts`
- Current mitigation: None.
- Recommendations: Single-flight queue per process, or external rate limiter.

## Performance Bottlenecks

**Screenshots done sequentially per side:**
- Problem: `screenshotPages` loops slugs serially within each side. For 20 slugs at ~3s each, that's a minute per side.
- Files: `src/lib/screenshotter.ts:88-103`
- Cause: One page reused per call but no concurrency.
- Improvement path: Parallelize with a small pool (e.g., 3-5 concurrent contexts), driven by a configurable `concurrency` option.

**`PNG.sync.read` and `PNG.sync.write` are synchronous and block the event loop:**
- Problem: For full-page screenshots that can be 5000px+ tall, sync PNG decoding stalls the Node event loop for hundreds of ms.
- Files: `src/lib/differ.ts:23-24,47`
- Cause: pngjs sync API.
- Improvement path: Use streaming `PNG` parsing or run diffing in a `worker_threads` Worker.

**`listRuns` reads every meta.json on every home page hit:**
- Problem: Each request to `/` reads N JSON files from disk (N = number of past runs). Combined with `force-dynamic`, this scales poorly.
- Files: `src/lib/storage.ts:30-44`, `src/app/page.tsx:9`
- Cause: No index file; every directory entry is loaded and parsed.
- Improvement path: Maintain `data/runs/index.json` updated on create/delete, or cache in-memory with file-watcher invalidation.

**Padding to max dimensions wastes memory and pixels:**
- Problem: When sizes differ, both images are padded with white to the max W×H, and the entire padded canvas is diffed. Tall site B padded to A's height counts every padded pixel as "matching white" — skewing `mismatchPercent` low.
- Files: `src/lib/differ.ts:28-52`
- Cause: Naive same-size requirement of `pixelmatch`.
- Improvement path: Either (a) report sizeDiff prominently and skip percent, or (b) pad with a sentinel color and exclude padded region from total pixel count.

**Diff PNGs cached for a year regardless of run state:**
- Problem: `Cache-Control: public, max-age=31536000` is set unconditionally. If a run is re-run with the same id (won't happen today, but), or if files are regenerated, browsers would serve stale.
- Files: `src/app/api/image/[...path]/route.ts:14-18`
- Cause: Static cache header.
- Improvement path: Use `immutable` only when run id is content-addressed; otherwise add ETag based on mtime.

## Fragile Areas

**Slug-to-filename mapping (4 sites of truth):**
- Files: `src/lib/storage.ts:61-64`, `src/lib/screenshotter.ts:91`, `src/components/ResultsGrid.tsx:74`, `src/components/DiffViewer.tsx:39`
- Why fragile: Any slug containing `?`, `#`, encoded chars, trailing `/`, or unicode will likely break differently in each location.
- Safe modification: Centralize first; then change.
- Test coverage: None — no tests exist.

**Run id format coupling:**
- Files: `src/app/api/compare/route.ts:19`, `src/lib/storage.ts:46-49`
- Why fragile: Run id is `YYYY-MM-DD-<nanoid8>`. Any consumer that parses dates from id (currently none, but `createdAt` exists in metadata) will break if the format changes.
- Safe modification: Treat id as opaque; sort by `createdAt`.
- Test coverage: None.

**`force-dynamic` + filesystem coupling on Vercel-like serverless:**
- Files: `src/app/page.tsx`, `src/app/runs/[id]/page.tsx`, `src/lib/storage.ts`
- Why fragile: The app reads/writes `process.cwd()/data/runs`. On serverless, that's ephemeral and read-only. The deployment story is "Docker with a volume" only.
- Safe modification: Document Docker-only and reject Vercel deploys, or abstract storage behind an interface.
- Test coverage: None.

**Browser launch in `next dev` HMR:**
- Files: `src/lib/screenshotter.ts:4`
- Why fragile: Module-level `let browser` is reset on HMR but the underlying Chromium process may leak.
- Safe modification: Avoid HMR for this module or detach launch from module scope.
- Test coverage: None.

## Scaling Limits

**Single-process Chromium:**
- Current capacity: One process, sequential per side.
- Limit: Memory grows with each `newContext`. ~10-20 concurrent contexts on a 4GB container.
- Scaling path: Worker pool with bounded concurrency; or out-of-process Playwright service.

**Disk usage:**
- Current capacity: Bounded only by disk size.
- Limit: Full-page screenshots of large sites can be 5-20MB each; 3 per slug × 20 slugs × N runs adds up fast.
- Scaling path: Retention policy, optional WebP/JPEG output, or external object storage (S3) behind storage interface.

**Concurrent comparison requests:**
- Current capacity: 1 (effective).
- Limit: Two simultaneous `POST /api/compare` calls share the same `browser` singleton, then one calls `closeBrowser()` while the other is still using contexts → likely error.
- Scaling path: Reference-count the browser, or queue runs.

## Dependencies at Risk

**`next ^16.1.6` (very recent major):**
- Risk: Next 16 is bleeding-edge as of analysis date. App Router APIs (e.g., `params: Promise<>`) reflect current contract but behavior may shift in patch releases.
- Impact: Build breakage on minor upgrades.
- Migration plan: Pin exact version until stable; track release notes.

**`react ^19.2.4` and `react-dom ^19.2.4`:**
- Risk: React 19 ecosystem (some libs lag).
- Impact: None today (no third-party UI libs used).
- Migration plan: N/A while UI stack is just Tailwind + native elements.

**`playwright ^1.58.1` vs Docker base `playwright:v1.40.0-jammy`:**
- Risk: Docker base image pins Playwright 1.40, but `package.json` installs 1.58. Mismatch between the npm package and the bundled browser binaries can cause "browser not found" or protocol errors.
- Files: `Dockerfile:1`, `package.json:19`
- Impact: Container builds may install fresh browsers (`npm ci` triggers postinstall? — Playwright doesn't auto-install browsers via npm postinstall by default), or use mismatched binaries silently.
- Migration plan: Bump base image to `mcr.microsoft.com/playwright:v1.58.1-jammy` (or matching tag), or run `npx playwright install` in Dockerfile after `npm ci`.

**`@types/node ^25.x`:**
- Risk: Node 25 types ahead of LTS (Node 22). README says "Node 18+".
- Impact: Type-check passes against APIs not present in the runtime.
- Migration plan: Pin types to match runtime (e.g., `@types/node@^22`).

**No lockfile audit / Dependabot:**
- Risk: No automated dep upgrades; transitive vulns go unnoticed.
- Impact: Security drift over time.
- Migration plan: Enable GitHub Dependabot or Renovate.

## Missing Critical Features

**No progress feedback during a run:**
- Problem: User clicks "Run Comparison" and the button shows "Running comparison..." until the entire run completes (could be minutes). No per-slug progress.
- Blocks: Reasonable UX for sitemaps with >5 slugs.

**No cancel / abort:**
- Problem: Once started, a run runs to completion. Closing the tab leaves the server processing.
- Blocks: Recovering from a misconfigured run.

**No structured error reporting:**
- Problem: Errors are stringified and stuffed into `PageResult.error`. No stack traces, no categorization (timeout vs DNS vs HTTP 500).
- Blocks: Debugging failed runs.

**No tests of any kind:**
- Problem: Zero test files exist. Pure functions like `parseSitemap`, `urlToSlug`, `slugToFilename`, `determineStatus`, `padImage` are easily testable.
- Blocks: Safe refactoring; regression detection.

**No baseline / approval workflow:**
- Problem: Tool reports diffs but offers no way to mark a diff as "expected" / approved.
- Blocks: Use as part of a CI flow.

**No CLI / non-UI invocation:**
- Problem: All comparisons go through the HTTP API + UI.
- Blocks: Scripted use, CI integration, scheduled runs.

**No authentication for protected sites:**
- Problem: Cannot screenshot pages behind auth (no cookie injection, no basic auth, no header injection in `takeScreenshot`).
- Blocks: Comparing logged-in flows or staging behind basic auth.

**No viewport / device presets in UI:**
- Problem: `viewport`, `delay`, `threshold`, `hideSelectors` are accepted by the API but have no form fields. Users cannot configure them via UI; only defaults apply.
- Files: `src/components/CompareForm.tsx`, `src/app/api/compare/route.ts:20-26`
- Blocks: Mobile diffs, sites with cookie banners, animated splash screens.

## Test Coverage Gaps

**Everything — no tests exist.**

**Highest-value targets:**

- `parseSitemap` / `urlToSlug` — `src/lib/sitemap.ts`
  - Risk: Silent empty result on sitemap-index; cross-origin handling.
  - Priority: High.

- `slugToFilename` (and its three duplicates) — `src/lib/storage.ts:61`, `src/lib/screenshotter.ts:91`, `src/components/ResultsGrid.tsx:74`, `src/components/DiffViewer.tsx:39`
  - Risk: Filename collisions, encoding bugs.
  - Priority: High.

- `padImage` / `determineStatus` — `src/lib/differ.ts`
  - Risk: Off-by-one in padding; threshold boundary at 0.05%.
  - Priority: Medium.

- `POST /api/compare` body validation — `src/app/api/compare/route.ts`
  - Risk: 500s on malformed input.
  - Priority: Medium.

- Path-traversal guards — `src/app/api/image/[...path]/route.ts`, `src/app/api/runs/[id]/route.ts`
  - Risk: Security.
  - Priority: High.

- SSRF guards — `src/lib/sitemap.ts`, `src/lib/screenshotter.ts`
  - Risk: Security (depends on deployment posture).
  - Priority: High for multi-tenant; Medium for local-only.

---

*Concerns audit: 2026-04-27*
