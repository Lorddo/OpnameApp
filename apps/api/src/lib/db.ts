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
/** Service-role client; handlers MUST scope by auth.orgId (auth param reserved for call-site clarity). */
export function dbForAuth(env: Env, _auth: AuthContext): SupabaseClient {
  return createServiceClient(env)
}

/** Platform API keys must not write via the PWA field-flow endpoints. */
export function assertPwaWrite(auth: AuthContext) {
  if (auth.kind === 'api_key' && auth.orgType === 'platform') {
    throw new ApiError(403, 'forbidden', 'Platform API keys cannot write via PWA flow endpoints')
  }
}

/**
 * Property visible to org as home, creator, active assignee,
 * or (platform key) same tenant.
 */
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

  if (auth.kind === 'api_key' && auth.orgType === 'platform' && auth.tenantId) {
    const { data: homeOrg, error: orgError } = await db
      .from('organizations')
      .select('tenant_id')
      .eq('id', property.home_org_id)
      .maybeSingle()
    if (orgError) throw new ApiError(500, 'db_error', orgError.message)
    if (homeOrg?.tenant_id === auth.tenantId) return property
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

/**
 * Inspection/photo read scope:
 * - inspection org → owner_org_id
 * - client org → client_org_id or property home_org_id
 * - platform key → same tenant
 */
export async function assertInspectionReadAccess(
  db: SupabaseClient,
  auth: AuthContext,
  inspection: {
    id: string
    owner_org_id: string
    client_org_id: string | null
    property_id: string
  },
) {
  if (inspection.owner_org_id === auth.orgId) return
  if (inspection.client_org_id === auth.orgId) return

  if (auth.kind === 'api_key' && auth.orgType === 'platform' && auth.tenantId) {
    const { data: ownerOrg, error } = await db
      .from('organizations')
      .select('tenant_id')
      .eq('id', inspection.owner_org_id)
      .maybeSingle()
    if (error) throw new ApiError(500, 'db_error', error.message)
    if (ownerOrg?.tenant_id === auth.tenantId) return
  }

  // Client org via property home
  const { data: property, error: propError } = await db
    .from('properties')
    .select('home_org_id')
    .eq('id', inspection.property_id)
    .maybeSingle()
  if (propError) throw new ApiError(500, 'db_error', propError.message)
  if (property?.home_org_id === auth.orgId) return

  throw new ApiError(403, 'forbidden', 'Outside organization scope')
}

export async function assertPhotoReadAccess(
  db: SupabaseClient,
  auth: AuthContext,
  photo: {
    owner_org_id: string
    property_id: string
    source_inspection_id: string | null
  },
) {
  if (photo.owner_org_id === auth.orgId) return

  if (auth.kind === 'api_key' && auth.orgType === 'platform' && auth.tenantId) {
    const { data: ownerOrg, error } = await db
      .from('organizations')
      .select('tenant_id')
      .eq('id', photo.owner_org_id)
      .maybeSingle()
    if (error) throw new ApiError(500, 'db_error', error.message)
    if (ownerOrg?.tenant_id === auth.tenantId) return
  }

  const { data: property, error: propError } = await db
    .from('properties')
    .select('home_org_id')
    .eq('id', photo.property_id)
    .maybeSingle()
  if (propError) throw new ApiError(500, 'db_error', propError.message)
  if (property?.home_org_id === auth.orgId) return

  if (photo.source_inspection_id) {
    const { data: inspection, error: inspError } = await db
      .from('inspections')
      .select('client_org_id')
      .eq('id', photo.source_inspection_id)
      .maybeSingle()
    if (inspError) throw new ApiError(500, 'db_error', inspError.message)
    if (inspection?.client_org_id === auth.orgId) return
  }

  throw new ApiError(403, 'forbidden', 'Outside organization scope')
}
