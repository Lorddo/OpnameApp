import type { AuthContext } from './auth.js'
import { createServiceClient } from './supabase.js'
import type { Env } from '../env.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from './errors.js'

/**
 * BFF database access.
 *
 * The Worker already authenticates the caller (JWT / API key). We use the
 * service role so PostgREST is not dependent on forwarding the user JWT
 * (publishable-key + RLS immersion is brittle on Workers). Handlers MUST
 * scope reads/writes by auth.orgId (and property ownership checks).
 *
 * RLS remains defense-in-depth for any direct Supabase Data API access.
 */
export function dbForAuth(env: Env, _auth: AuthContext): SupabaseClient {
  return createServiceClient(env)
}

export function assertOrgScope(auth: AuthContext, orgId: string) {
  if (auth.orgId !== orgId) {
    throw new ApiError(403, 'forbidden', 'Outside organization scope')
  }
}

/** Property visible to org as home, creator, or active assignee. */
export async function assertPropertyAccess(
  db: SupabaseClient,
  auth: AuthContext,
  propertyId: string,
) {
  const { data: property, error } = await db
    .from('properties')
    .select('id, home_org_id, created_by_org_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!property) throw new ApiError(404, 'not_found', 'Property not found')

  if (property.home_org_id === auth.orgId || property.created_by_org_id === auth.orgId) {
    return property
  }

  const now = new Date().toISOString()
  const { data: assignment, error: assignError } = await db
    .from('property_assignments')
    .select('id')
    .eq('property_id', propertyId)
    .eq('org_id', auth.orgId)
    .lte('active_from', now)
    .or(`active_to.is.null,active_to.gt.${now}`)
    .maybeSingle()

  if (assignError) throw new ApiError(500, 'db_error', assignError.message)
  if (!assignment) throw new ApiError(403, 'forbidden', 'No access to property')
  return property
}
