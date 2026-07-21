import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react'
import CompareForm from './CompareForm'

// Next's real useSearchParams() returns a stable reference across renders of
// the same URL. A fresh `new URLSearchParams()` per call breaks that: the
// component's `useEffect(..., [searchParams])` (CompareForm.tsx) would then
// fire on every render, racing its own localStorage-persist effect and
// bouncing `sitemapUrl` between "" and the typed value forever.
const stableSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => stableSearchParams,
}))

const SLUG_COUNT = 500
const slugs = Array.from({ length: SLUG_COUNT }, (_, i) =>
  i % 10 === 0 ? `/mba/page-${i}` : `/other/page-${i}`,
)

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  // @tanstack/virtual-core measures the scroll container via
  // offsetWidth/offsetHeight (not getBoundingClientRect), which jsdom always
  // reports as 0 — leaving the virtualizer with zero rows. Give it a
  // measurable size so it actually windows the list.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    value: 600,
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 256,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ({ slugs }),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function renderWithSitemap() {
  render(<CompareForm defaultConcurrency={3} />)
  fireEvent.change(
    screen.getByPlaceholderText('https://example.com/sitemap.xml'),
    {
      target: { value: 'https://example.com/sitemap.xml' },
    },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
  await waitFor(() =>
    expect(
      screen.getByText(`${SLUG_COUNT} of ${SLUG_COUNT} selected`),
    ).toBeDefined(),
  )
}

describe('sitemap list virtualization', () => {
  it('renders only a window of rows, not every slug', async () => {
    await renderWithSitemap()

    const checkboxes = screen.getAllByRole('checkbox')
    // 500 slugs in the list; a windowed list renders far fewer rows.
    expect(checkboxes.length).toBeGreaterThan(0)
    expect(checkboxes.length).toBeLessThan(100)
  })
})

describe('filtered select-all / clear', () => {
  it('select-all adds only the filtered slugs', async () => {
    await renderWithSitemap()

    // Clear everything first so select-all's effect is observable.
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await screen.findByText(`0 of ${SLUG_COUNT} selected`)

    fireEvent.change(screen.getByPlaceholderText('Filter slugs (e.g. /mba)'), {
      target: { value: '/mba' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

    await screen.findByText(`${SLUG_COUNT / 10} of ${SLUG_COUNT} selected`)
  })

  it('clear removes only the filtered slugs', async () => {
    await renderWithSitemap()

    fireEvent.change(screen.getByPlaceholderText('Filter slugs (e.g. /mba)'), {
      target: { value: '/mba' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await screen.findByText(
      `${SLUG_COUNT - SLUG_COUNT / 10} of ${SLUG_COUNT} selected`,
    )
  })
})
