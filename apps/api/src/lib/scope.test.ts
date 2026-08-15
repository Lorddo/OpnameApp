import { describe, expect, it } from 'vitest'
import type { AuthContext } from './auth.js'
import { applyInspectionListScope, applyPhotoOwnerScope } from './scope.js'

function fakeQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const q = {
    eq(...args: unknown[]) {
      calls.push({ method: 'eq', args })
      return q
    },
    in(...args: unknown[]) {
      calls.push({ method: 'in', args })
      return q
    },
    _calls: calls,
  }
  return q
}

describe('applyInspectionListScope', () => {
  it('scopes client orgs to client_org_id', async () => {
    const auth = {
      kind: 'user',
      orgId: 'client-1',
      orgType: 'client',
    } as AuthContext
    const q = fakeQuery()
    const result = await applyInspectionListScope(q, {} as never, auth)
    expect(result.empty).toBe(false)
    expect(q._calls).toEqual([{ method: 'eq', args: ['client_org_id', 'client-1'] }])
  })

  it('scopes inspection orgs to owner_org_id', async () => {
    const auth = {
      kind: 'user',
      orgId: 'insp-1',
      orgType: 'inspection',
    } as AuthContext
    const q = fakeQuery()
    const result = await applyInspectionListScope(q, {} as never, auth)
    expect(result.empty).toBe(false)
    expect(q._calls).toEqual([{ method: 'eq', args: ['owner_org_id', 'insp-1'] }])
  })
})

describe('applyPhotoOwnerScope', () => {
  it('does not filter owner for client orgs', () => {
    const auth = {
      kind: 'user',
      orgId: 'client-1',
      orgType: 'client',
    } as AuthContext
    const q = fakeQuery()
    applyPhotoOwnerScope(q, auth)
    expect(q._calls).toEqual([])
  })

  it('filters owner for inspection orgs', () => {
    const auth = {
      kind: 'user',
      orgId: 'insp-1',
      orgType: 'inspection',
    } as AuthContext
    const q = fakeQuery()
    applyPhotoOwnerScope(q, auth)
    expect(q._calls).toEqual([{ method: 'eq', args: ['owner_org_id', 'insp-1'] }])
  })
})
