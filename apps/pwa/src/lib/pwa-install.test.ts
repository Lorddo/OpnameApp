import { describe, expect, it } from 'vitest'
import { isIosDevice, isStandaloneDisplay } from './pwa-install'

describe('isStandaloneDisplay', () => {
  it('is true when display-mode is standalone', () => {
    expect(
      isStandaloneDisplay({
        matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' }),
        standalone: false,
      }),
    ).toBe(true)
  })

  it('is true for iOS navigator.standalone', () => {
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }),
        standalone: true,
      }),
    ).toBe(true)
  })

  it('is false in a normal browser tab', () => {
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }),
        standalone: false,
      }),
    ).toBe(false)
  })
})

describe('isIosDevice', () => {
  it('detects iPhone and iPad user agents', () => {
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(
      true,
    )
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' })).toBe(true)
  })

  it('detects iPadOS that reports as MacIntel', () => {
    expect(
      isIosDevice({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(true)
  })

  it('does not treat a desktop Mac as iOS', () => {
    expect(
      isIosDevice({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe(false)
  })
})
