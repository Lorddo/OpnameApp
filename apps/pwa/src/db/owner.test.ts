import { describe, expect, it } from 'vitest'
import { localOwnerId, shouldClearLocalWorkspace } from './owner'

describe('shouldClearLocalWorkspace', () => {
  it('keeps data for the same user and org', () => {
    expect(shouldClearLocalWorkspace('u1:o1', 'u1:o1', true)).toBe(false)
  })

  it('clears when the signed-in user or org changes', () => {
    expect(shouldClearLocalWorkspace('u1:o1', 'u2:o1', true)).toBe(true)
    expect(shouldClearLocalWorkspace('u1:o1', 'u1:o2', false)).toBe(true)
  })

  it('clears an unbound workspace so a new login cannot inherit leftovers', () => {
    expect(shouldClearLocalWorkspace(null, 'u2:o2', true)).toBe(true)
  })

  it('does not clear an empty first bind', () => {
    expect(shouldClearLocalWorkspace(null, 'u1:o1', false)).toBe(false)
  })
})

describe('localOwnerId', () => {
  it('scopes the cache to user and org', () => {
    expect(localOwnerId('user-a', 'org-b')).toBe('user-a:org-b')
  })
})
