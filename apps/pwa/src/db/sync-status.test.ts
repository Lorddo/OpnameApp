import { describe, expect, it } from 'vitest'
import { isBusySyncStatus } from './sync-status'

describe('isBusySyncStatus', () => {
  it('treats pending, error, and draft as busy', () => {
    expect(isBusySyncStatus('pending')).toBe(true)
    expect(isBusySyncStatus('error')).toBe(true)
    expect(isBusySyncStatus('draft')).toBe(true)
  })

  it('treats synced and empty as not busy', () => {
    expect(isBusySyncStatus('synced')).toBe(false)
    expect(isBusySyncStatus(null)).toBe(false)
    expect(isBusySyncStatus(undefined)).toBe(false)
  })
})
