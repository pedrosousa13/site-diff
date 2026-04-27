# Technology Stack

**Analysis Date:** 2026-04-27

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code (`src/**/*.ts`, `src/**/*.tsx`)

**Secondary:**
- CSS - Global styles via Tailwind (`src/app/globals.css`)
- JavaScript (config files) - PostCSS config (`postcss.config.mjs`)

## Runtime

**Environment:**
- Node.js 18+ (per `README.md`); local dev observed on Node v20.19.2
- Next.js server runtime (App Router, server components + route handlers)

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack React framework, App Router (`next.config.ts`, `src/app/`)
- React 19.2.4 / React DOM 19.2.4 - UI library
- Tailwind CSS 4.1.18 - Utility-first styling via `@tailwindcss/postcss` plugin (`postcss.config.mjs`, `src/app/globals.css`)

**Testing:**
- Not detected (no test files, no test runner in `package.json`)

**Build/Dev:**
- Next.js CLI - `next dev -p 3333`, `next build`, `next start -p 3333` (`package.json` scripts)
- TypeScript compiler 5.9.3 - Type checking only (`noEmit: true` in `tsconfig.json`)
- PostCSS 8.5.6 - CSS pipeline (`postcss.config.mjs`)

## Key Dependencies

**Critical:**
- `playwright` ^1.58.1 - Headless Chromium for full-page screenshots (`src/lib/screenshotter.ts`). Marked as `serverExternalPackages` in `next.config.ts`.
- `pixelmatch` ^7.1.0 - Pixel-level image diffing (`src/lib/differ.ts`)
- `pngjs` ^7.0.0 - PNG read/write/manipulation, used to pad images before diff (`src/lib/differ.ts`)
- `fast-xml-parser` ^5.3.4 - Sitemap XML parsing (`src/lib/sitemap.ts`)
- `nanoid` ^5.1.6 - Run ID generation (`src/app/api/compare/route.ts`)

**Infrastructure:**
- Node `fs/promises` - File-based persistence under `data/runs/` (`src/lib/storage.ts`, `src/app/api/image/[...path]/route.ts`)

## Configuration

**Environment:**
- No `.env` files present in repo
- No `process.env` reads in `src/` (verified via grep)
- Runtime config is hardcoded defaults in `src/lib/types.ts` (`DEFAULT_CONFIG`) and per-request body to `/api/compare`

**Build:**
- `next.config.ts` - Sets `serverExternalPackages: ['playwright']` so Next.js does not bundle Playwright
- `tsconfig.json` - `target: ES2017`, `module: esnext`, `moduleResolution: bundler`, `strict: true`, path alias `@/* -> ./src/*`
- `postcss.config.mjs` - Registers `@tailwindcss/postcss` plugin
- `next-env.d.ts` - Next.js type augmentation (gitignored)

## Platform Requirements

**Development:**
- Node.js 18+
- npm
- Playwright Chromium browser (`npx playwright install chromium`)
- Dev server port: 3333

**Production:**
- Docker image based on `mcr.microsoft.com/playwright:v1.40.0-jammy` (`Dockerfile`)
- Exposes port 3000 (Dockerfile `EXPOSE 3000`); container `CMD ["npm", "start"]` runs `next start -p 3333` per `package.json` (port mismatch — see CONCERNS)
- `docker-compose.yml` maps host `3000:3000` and bind-mounts `./data:/app/data` for run persistence
- Filesystem volume required for `data/runs/` (no database)

---

*Stack analysis: 2026-04-27*
