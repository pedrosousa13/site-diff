import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

function Probe() {
  return <button>infra-ready</button>
}

describe('component test infra', () => {
  it('renders React components into jsdom', () => {
    render(<Probe />)
    expect(screen.getByRole('button', { name: 'infra-ready' })).toBeDefined()
  })
})
