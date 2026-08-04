import { describe, expect, it } from 'vitest'
import { parseRunConfig } from './runConfig'
import { DEFAULT_CONFIG } from './types'

function value(input: unknown) {
  const parsed = parseRunConfig(input)
  if (!parsed.ok) throw new Error(`expected ok, got: ${parsed.error}`)
  return parsed.value
}

function error(input: unknown) {
  const parsed = parseRunConfig(input)
  if (parsed.ok) throw new Error('expected an error')
  return parsed.error
}

describe('parseRunConfig', () => {
  it('falls back to the defaults when nothing is supplied', () => {
    expect(value(undefined)).toEqual(DEFAULT_CONFIG)
  })

  it('keeps supplied values', () => {
    expect(
      value({
        viewport: { width: 375, height: 812 },
        fullPage: false,
        delay: 2000,
        threshold: 0.3,
        matchPercentCutoff: 1.5,
        excludeHttpErrors: false,
        hideSelectors: ['#onetrust-consent-sdk'],
        clickSelectors: ['#accept'],
      }),
    ).toEqual({
      viewport: { width: 375, height: 812 },
      fullPage: false,
      delay: 2000,
      threshold: 0.3,
      matchPercentCutoff: 1.5,
      excludeHttpErrors: false,
      hideSelectors: ['#onetrust-consent-sdk'],
      clickSelectors: ['#accept'],
    })
  })

  it('leaves the selector lists absent when they are empty', () => {
    const parsed = value({ hideSelectors: [], clickSelectors: [] })

    expect(parsed.hideSelectors).toBeUndefined()
    expect(parsed.clickSelectors).toBeUndefined()
  })

  it.each([
    ['threshold', -0.1],
    ['threshold', 1.1],
    ['threshold', 'high'],
    ['threshold', Infinity],
    ['matchPercentCutoff', -1],
    ['matchPercentCutoff', 101],
    ['matchPercentCutoff', NaN],
  ])('rejects %s of %s', (field, bad) => {
    expect(error({ [field]: bad })).toContain(field)
  })

  it.each([
    ['delay', -1],
    ['delay', 'soon'],
    ['viewport', { width: 0, height: 720 }],
    ['viewport', { width: 1280 }],
    ['viewport', 'wide'],
  ])('rejects %s of %s', (field, bad) => {
    expect(error({ [field]: bad })).toContain(field)
  })

  it('rejects a selector list that is not an array of strings', () => {
    expect(error({ hideSelectors: '#a' })).toContain('hideSelectors')
    expect(error({ clickSelectors: [1] })).toContain('clickSelectors')
  })

  it('rejects a config that is not an object', () => {
    expect(error('nope')).toBeTruthy()
  })
})
