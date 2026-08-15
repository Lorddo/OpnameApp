import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthContext } from './auth.js'
import { throwIfDbError } from './db-result.js'

type FilterColumn = (column: string, value: unknown) => unknown
type FilterIn = (column: string, values: readonly unknown[]) => unknown

export async function orgIdsForTenant(db: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data, error } = await db.from('organizations').select('id').eq('tenant_id', tenantId)
  throwIfDbError(error)
  return (data ?? []).map((o) => o.id as string)
}

/** Scope an inspections list query by platform tenant / client / owner org. */
export async function applyInspectionListScope<T extends { eq: FilterColumn; in: FilterIn }>(
  query: T,
  db: SupabaseClient,
  auth: AuthContext,
): Promise<{ query: T; empty: boolean }> {
  if (auth.kind === 'api_key' && auth.orgType === 'platform' && auth.tenantId) {
    const orgIds = await orgIdsForTenant(db, auth.tenantId)
    if (orgIds.length === 0) return { query, empty: true }
    return { query: query.in('owner_org_id', orgIds) as T, empty: false }
  }
  if (auth.orgType === 'client') {
    return { query: query.eq('client_org_id', auth.orgId) as T, empty: false }
  }
  return { query: query.eq('owner_org_id', auth.orgId) as T, empty: false }
}

/** Narrow photos list to owner org unless platform/client already authorized via property. */
export function applyPhotoOwnerScope<T extends { eq: FilterColumn }>(query: T, auth: AuthContext): T {
  if (auth.kind === 'api_key' && auth.orgType === 'platform' && auth.tenantId) return query
  if (auth.orgType === 'client') return query
  return query.eq('owner_org_id', auth.orgId) as T
}
