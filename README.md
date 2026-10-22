# Site Diff

Visual comparison tool for websites. Compare two versions of a site and spot differences instantly.

## Features

- **Side-by-side comparison** - Compare any two URLs (staging vs prod, localhost vs live, etc.)
- **Pixel-level diff detection** - Uses pixelmatch to highlight exact differences
- **Multiple view modes** - Side-by-side, diff overlay, and slider comparison
- **Sitemap support** - Fetch pages from sitemap.xml or enter slugs manually
- **Full page screenshots** - Captures entire scrollable page with Playwright
- **Configurable thresholds** - Adjust sensitivity for anti-aliasing tolerance
- **Run history** - Browse and revisit past comparisons
- **Form persistence** - Remembers your last inputs via localStorage
- **SSL error handling** - Auto-fallback from https to http on SSL errors

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Start dev server
npm run dev
```

App runs at http://localhost:3333

### Project Structure

```
src/
├── app/
│   ├── page.tsx              # Home / new comparison form
│   ├── runs/[id]/page.tsx    # Results view
│   └── api/
│       ├── compare/          # Trigger comparison
│       ├── sitemap/          # Fetch & parse sitemap
│       └── runs/             # List/get past runs
├── lib/
│   ├── screenshotter.ts      # Playwright screenshot logic
│   ├── differ.ts             # pixelmatch diff generation
│   ├── sitemap.ts            # XML parsing
│   ├── storage.ts            # File operations
│   └── types.ts              # TypeScript types
├── components/
│   ├── CompareForm.tsx       # URL input form
│   ├── ResultsGrid.tsx       # Results thumbnail grid
│   └── DiffViewer.tsx        # Side-by-side/overlay/slider
data/
└── runs/                     # Comparison results (gitignored)
```

### Configuration Options

| Option         | Default  | Description                                                                                                                                                                                                                          |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| viewport       | 1280x720 | Browser window width (affects responsive layouts)                                                                                                                                                                                    |
| fullPage       | true     | Capture entire scroll height (default)                                                                                                                                                                                               |
| delay          | 500ms    | Wait after page load for animations                                                                                                                                                                                                  |
| threshold      | 0.1      | pixelmatch sensitivity (0-1)                                                                                                                                                                                                         |
| hideSelectors  | []       | CSS selectors to hide with `display: none` (e.g., `.cookie-banner`)                                                                                                                                                                  |
| clickSelectors | []       | CSS selectors to click after load, to dismiss banners. Prefer `hideSelectors`: a selector that never appears costs a 1.5s wait on every page, and accepting a consent banner loads the scripts it gated, which can shift the layout. |

### Environment variables

| Variable             | Description                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SITE_DIFF_USER_AGENT | User-Agent for every screenshot. Use it for sites behind SSO that let an allowlisted User-Agent through. Unset keeps the Playwright default. |

A run page has a Settings panel holding the values it was captured with. Edit
them and re-run to replace that run's screenshots and results. Use "Run Again"
instead to keep the current results and start a separate run.

## For AI agents

Read a run as plain text instead of loading full-page screenshots:

```bash
curl "http://localhost:3333/api/runs/<run-id>/report?top=20"
```

The report lists the counts, every error (first line only), and the `top`
worst diff pages (default 20, max 200). Each page line gives the mismatch
percentage, the page heights when they differ, and up to 5 changed regions as
y-ranges. For each region, site-diff writes one small crop to
`data/runs/<run-id>/report/`: A on the left, B on the right, scaled to at most
1200px wide. Open only the crops you need. They cost far fewer tokens than the
full screenshots.

## Self-Hosting

### Docker

```bash
# Build and run
docker compose up -d

# Or build manually
docker build -t site-diff .
docker run -p 3000:3000 -v ./data:/app/data site-diff
```

App runs at http://localhost:3000

### Docker Compose

```yaml
services:
  site-diff:
    build: .
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
```

The `data` volume persists comparison results between container restarts.

### Environment Notes

- Uses Microsoft's Playwright Docker image with pre-installed browsers
- No database required - results stored as files in `data/runs/`
- For production, consider adding a reverse proxy (nginx/traefik) with SSL
