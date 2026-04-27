# site-diff

## What This Is

Self-hosted visual regression tool. Take two base URLs (e.g. `staging.example.com` vs `prod.example.com`) and a list of slugs, screenshot both sides full-page in headless Chromium, and pixel-diff to surface what changed. Built for developers/designers comparing site versions before deploys.

## Core Value

**A diff between two sites must reflect real visual changes — not screenshot flake.** If the tool reports a diff, it must be a real difference, not lazy-loaded images, late fonts, or animations caught mid-flight.

## Requirements

### Validated

<!-- Shipped in current codebase, mapped 2026-04-27. Treated as v1 baseline. -->

- ✓ **CMP-01**: User submits two base URLs + slug list, gets per-slug diff result — existing
- ✓ **CMP-02**: Full-page Chromium screenshots for both sides in parallel — existing
- ✓ **CMP-03**: Pixel-diff via `pixelmatch` with configurable threshold (default 0.05%) — existing
- ✓ **CMP-04**: Per-slug status (`match` / `diff` / `error`) with mismatch percentage — existing
- ✓ **VIEW-01**: Side-by-side, overlay, and slider modal viewer for any pair — existing
- ✓ **VIEW-02**: Browse historical runs at `/runs/<id>` — existing
- ✓ **VIEW-03**: Delete run from history — existing
- ✓ **SITE-01**: Fetch slug list from external `sitemap.xml` (auto-fill first 10) — existing
- ✓ **STORE-01**: Filesystem-backed storage under `data/runs/<id>/` (no DB) — existing
- ✓ **STORE-02**: Image streaming endpoint with one-year cache — existing
- ✓ **CFG-01**: Per-run config (viewport, fullPage, delay, threshold, hideSelectors) — existing
- ✓ **OPS-01**: Docker / docker-compose entry with persisted `data/` volume — existing

### Active

<!-- Milestone 2 — Screenshot Reliability. Make captures deterministic and complete. -->

- [ ] **REL-01**: Lazy-loaded images (`<img loading="lazy">`, IntersectionObserver) fully loaded before capture
- [ ] **REL-02**: CSS background images fully loaded before capture
- [ ] **REL-03**: Web fonts loaded (`document.fonts.ready`) before capture
- [ ] **REL-04**: Animations and transitions skipped to final frame via CSS injection — no mid-animation captures
- [ ] **REL-05**: Auto-scroll page top→bottom to trigger lazy-load observers, then return to top
- [ ] **REL-06**: DOM poll for readiness — all `<img>.complete && naturalWidth>0`, no pending fetches, fonts ready
- [ ] **REL-07**: Hard 30s per-page timeout — capture whatever's there + flag in metadata if not settled
- [ ] **REL-08**: Run-to-run determinism — same URL captured 3× must match within existing 0.05% threshold
- [ ] **REL-09**: No new `ComparisonConfig` fields — settle behavior is global, hardcoded
- [ ] **REL-10**: Repeat-run regression test — automated check on curated test site list

### Out of Scope

- **Video / GIF playback** — too non-deterministic, capture whatever frame is there
- **Canvas / WebGL paint waits** — too app-specific, no generic detection
- **Auth-gated content** — anonymous pages only, login flows still out of scope
- **JS-disabled fallback rendering** — modern web only, JS assumed on
- **Per-site/per-run settle config** — settle is global hardcoded behavior, not exposed to callers
- **Async job queue** — `POST /api/compare` stays synchronous in this milestone (separate concern)
- **Path-traversal hardening on `/api/image`** — known issue, separate security milestone
- **Database / multi-user** — filesystem-only, single-tenant
- **CI integration / scheduled runs** — manual trigger only

## Context

**Codebase already mapped** (`.planning/codebase/`, refreshed 2026-04-27). Next.js App Router monolith, single Chromium singleton in `src/lib/screenshotter.ts`, synchronous request-blocking comparison job, filesystem persistence.

**Current screenshot wait logic** (`src/lib/screenshotter.ts:22-67`):
- `page.goto(url, { waitUntil: 'networkidle' })`
- Optional `delay` from `ComparisonConfig` (default 0)
- Optional `hideSelectors` injected before capture
- Full-page PNG via Playwright

**Why current logic fails:**
- `networkidle` fires when network goes quiet, not when DOM is visually settled
- IntersectionObserver-based lazy images never trigger if below initial viewport
- Web fonts can finish loading after `networkidle` → FOUT shifts content
- CSS animations / transitions run during `delay` window → mid-animation captures
- Result: false-positive diffs that obscure real changes (violates Core Value)

**Test sites** (TBD during validation phase): mix of well-known production sites known for lazy-load and animation patterns (Vercel, Stripe, NYT and similar).

## Constraints

- **Tech stack**: Next.js App Router + Playwright + pixelmatch — no framework changes in this milestone
- **API surface**: No new `ComparisonConfig` fields — backward-compatible, callers don't change
- **Performance**: Per-page total wait capped at 30s hard timeout
- **Determinism**: Run-to-run pixel stability is critical — must match within 0.05% threshold for static pages
- **Storage**: Existing `data/runs/<id>/` layout preserved — only `meta.json` may gain optional `settleFlag` field per slug
- **Browser**: Chromium only via Playwright singleton — no Firefox/Webkit added here

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Skip animations to final frame (CSS injection `animation-delay:-999s`) instead of waiting for natural completion | Determinism critical; waiting for completion conflicts with byte-stable captures | — Pending |
| Combination settle signal: auto-scroll + DOM poll + fonts.ready | Belt-and-suspenders; single signal misses edge cases | — Pending |
| 30s hard cap, capture-with-flag (not error) on timeout | Slow-but-renderable pages still produce usable diff; flag surfaces unreliability without losing data | — Pending |
| No new config fields — global hardcoded behavior | Avoid config explosion; trust good defaults; keep API stable | — Pending |
| Validate via test site list + repeat-run + visual eyeball + baseline diff | Multi-method confirms milestone delivered, not just "code runs" | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-27 after initialization (milestone 2 — screenshot reliability)*
