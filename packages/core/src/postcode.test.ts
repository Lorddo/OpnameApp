import { describe, expect, it } from 'vitest'
import { formatNlPostcode, isCompleteNlPostcode } from './postcode.js'

describe('formatNlPostcode', () => {
  it('normalizes spacing and casing to 1234 AA', () => {
    expect(formatNlPostcode('1234aa')).toBe('1234 AA')
    expect(formatNlPostcode('1234 Aa')).toBe('1234 AA')
    expect(formatNlPostcode('1234AA')).toBe('1234 AA')
    expect(formatNlPostcode('1234 AA')).toBe('1234 AA')
    expect(formatNlPostcode(' 1234  aA ')).toBe('1234 AA')
    expect(formatNlPostcode('1234-aa')).toBe('1234 AA')
  })

  it('formats while typing', () => {
    expect(formatNlPostcode('1')).toBe('1')
    expect(formatNlPostcode('1234')).toBe('1234')
    expect(formatNlPostcode('1234a')).toBe('1234 A')
    expect(formatNlPostcode('1234aa')).toBe('1234 AA')
  })

  it('drops extra characters after 4 digits and 2 letters', () => {
    expect(formatNlPostcode('1234AABB')).toBe('1234 AA')
  })

  it('returns empty for blank input', () => {
    expect(formatNlPostcode('')).toBe('')
    expect(formatNlPostcode('   ')).toBe('')
  })
})

describe('isCompleteNlPostcode', () => {
  it('accepts only the canonical format', () => {
    expect(isCompleteNlPostcode('1234 AA')).toBe(true)
    expect(isCompleteNlPostcode('1234AA')).toBe(false)
    expect(isCompleteNlPostcode('1234 aa')).toBe(false)
    expect(isCompleteNlPostcode('1234 A')).toBe(false)
    expect(isCompleteNlPostcode('')).toBe(false)
  })
})
