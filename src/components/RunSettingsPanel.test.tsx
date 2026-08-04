import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react'
import RunSettingsPanel from './RunSettingsPanel'
import type { ComparisonRun } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

function makeRun(overrides: Partial<ComparisonRun> = {}): ComparisonRun {
  return {
    id: 'run-1',
    baseUrlA: 'https://a.example.com',
    baseUrlB: 'https://b.example.com',
    createdAt: '2026-08-04T00:00:00.000Z',
    config: {
      viewport: { width: 1280, height: 720 },
      fullPage: true,
      delay: 500,
      threshold: 0.1,
      matchPercentCutoff: 0.05,
      excludeHttpErrors: true,
      hideSelectors: ['#onetrust-consent-sdk'],
    },
    slugs: ['/pricing', '/about'],
    results: [],
    status: 'completed',
    concurrency: 3,
    ...overrides,
  }
}

/** The JSON body of the last fetch call. */
function postedBody() {
  const call = vi.mocked(fetch).mock.calls.at(-1)
  if (!call) throw new Error('fetch was never called')
  return JSON.parse(String(call[1]!.body))
}

beforeEach(() => {
  refresh.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ id: 'run-1' }) })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RunSettingsPanel', () => {
  const field = (label: string) =>
    screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement

  it('prefills the fields from the run', () => {
    render(<RunSettingsPanel run={makeRun()} />)

    expect(field('Viewport width').value).toBe('1280')
    expect(field('Viewport height').value).toBe('720')
    expect(field('Delay (ms)').value).toBe('500')
    expect(field('Per-pixel threshold').value).toBe('0.1')
    expect(field('Match cutoff (%)').value).toBe('0.05')
    expect(field('Hide elements').value).toBe('#onetrust-consent-sdk')
    expect(field('Dismiss by clicking').value).toBe('')
  })

  it('names the number of slugs it will re-run', () => {
    render(<RunSettingsPanel run={makeRun()} />)

    expect(screen.getByRole('button', { name: /Re-run 2 pages/ })).toBeDefined()
  })

  it('posts the edited settings and every slug', async () => {
    render(<RunSettingsPanel run={makeRun()} />)

    fireEvent.change(screen.getByLabelText('Viewport width'), {
      target: { value: '375' },
    })
    fireEvent.change(screen.getByLabelText('Hide elements'), {
      target: { value: '#onetrust-consent-sdk\n.promo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Re-run 2 pages/ }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/runs/run-1/rerun')
    const body = postedBody()
    expect(body.slugs).toEqual(['/pricing', '/about'])
    expect(body.config.viewport).toEqual({ width: 375, height: 720 })
    expect(body.config.hideSelectors).toEqual([
      '#onetrust-consent-sdk',
      '.promo',
    ])
    expect(body.concurrency).toBe(3)
  })

  it('sends the A-side slugs for a pair run', async () => {
    render(
      <RunSettingsPanel
        run={makeRun({
          slugPairs: [
            { a: '/pricing', b: '/en/pricing' },
            { a: '/about', b: '/en/about' },
          ],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Re-run 2 pages/ }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(postedBody().slugs).toEqual(['/pricing', '/about'])
  })

  it('rejects an invalid selector before posting', async () => {
    render(<RunSettingsPanel run={makeRun()} />)

    fireEvent.change(screen.getByLabelText('Hide elements'), {
      target: { value: '#((' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Re-run 2 pages/ }))

    expect(await screen.findByText(/Invalid CSS selector/)).toBeDefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces a rejected config from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'threshold must be a finite number' }),
      })),
    )
    render(<RunSettingsPanel run={makeRun()} />)

    fireEvent.click(screen.getByRole('button', { name: /Re-run 2 pages/ }))

    expect(await screen.findByText(/threshold must be a finite/)).toBeDefined()
  })

  it('refreshes the page once the re-run has started', async () => {
    render(<RunSettingsPanel run={makeRun()} />)

    fireEvent.click(screen.getByRole('button', { name: /Re-run 2 pages/ }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('will not start a second re-run while one is in flight', async () => {
    render(<RunSettingsPanel run={makeRun({ status: 'running' })} />)

    const button = screen.getByRole('button', {
      name: /Re-run 2 pages/,
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})
