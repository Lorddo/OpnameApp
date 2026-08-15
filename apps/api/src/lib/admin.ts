import type { AuthContext } from './auth.js'
import { ApiError } from './errors.js'
import { createServiceClient } from './supabase.js'
import { supabaseSecretKey, type Env } from '../env.js'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export type CallerOrg = {
  id: string
  tenant_id: string
  name: string
  org_type: 'inspection' | 'client' | 'platform'
  external_id: string | null
}

/** Empty scopes = full access (MVP). Otherwise require one of the listed scopes. */
export function assertScope(auth: AuthContext, required: string) {
  const scopes = auth.scopes ?? []
  if (scopes.length === 0) return
  if (!scopes.includes(required) && !scopes.includes('*')) {
    throw new ApiError(403, 'forbidden', `API key missing scope: ${required}`)
  }
}

export function assertDashboardCaller(auth: AuthContext) {
  if (auth.kind === 'api_key') return
  if (auth.kind === 'user' && auth.orgRole === 'admin') return
  throw new ApiError(403, 'forbidden', 'API key or org admin required')
}

/** JWT org admin only (e.g. minting API keys — not via API key itself). */
export function assertOrgAdminJwt(auth: AuthContext) {
  if (auth.kind === 'user' && auth.orgRole === 'admin') return
  throw new ApiError(403, 'forbidden', 'Only org admins can perform this action')
}

/** API key or JWT org admin (assignments, dashboard writes). */
export function assertApiKeyOrAdmin(auth: AuthContext) {
  assertDashboardCaller(auth)
}

export async function assertPlatformCaller(env: Env, auth: AuthContext): Promise<CallerOrg> {
  assertDashboardCaller(auth)
  const caller = await loadCallerOrg(env, auth)
  if (caller.org_type !== 'platform') {
    throw new ApiError(403, 'forbidden', 'Platform organization required')
  }
  return caller
}

export async function loadCallerOrg(env: Env, auth: AuthContext): Promise<CallerOrg> {
  const db = createServiceClient(env)
  const { data, error } = await db
    .from('organizations')
    .select('id, tenant_id, name, org_type, external_id')
    .eq('id', auth.orgId)
    .maybeSingle()

  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!data) throw new ApiError(403, 'forbidden', 'Caller organization not found')
  return data as CallerOrg
}

export async function findAuthUserByEmail(env: Env, email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase()
  const service = createServiceClient(env)
  const secret = supabaseSecretKey(env)

  const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`)
  url.searchParams.set('page', '1')
  url.searchParams.set('per_page', '200')

  const res = await fetch(url, {
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
    },
  })

  if (res.ok) {
    const body = (await res.json()) as { users?: User[] }
    const match = (body.users ?? []).find((u) => (u.email ?? '').toLowerCase() === normalized)
    if (match) return match
  }

  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listed.error) return null
  return listed.data.users.find((u) => (u.email ?? '').toLowerCase() === normalized) ?? null
}

export async function ensureOrgMember(
  db: SupabaseClient,
  orgId: string,
  userId: string,
  role: 'inspector' | 'admin',
) {
  // Profile may lag invite trigger by a moment; upsert profile defensively.
  await db.from('profiles').upsert(
    { id: userId, display_name: null },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  const { error } = await db.from('org_members').upsert(
    { org_id: orgId, user_id: userId, role },
    { onConflict: 'org_id,user_id' },
  )
  if (error) throw new ApiError(400, 'db_error', error.message)
}

export type OrgRow = {
  id: string
  tenant_id: string
  name: string
  org_type: 'inspection' | 'client' | 'platform'
  external_id: string | null
  _created?: boolean
}

export async function resolveTargetOrg(
  service: SupabaseClient,
  caller: CallerOrg,
  auth: { kind: string; orgId: string },
  organization:
    | {
        externalId?: string
        name?: string
        orgType?: 'inspection' | 'client' | 'platform'
        id?: string
      }
    | undefined,
): Promise<OrgRow> {
  if (!organization || (!organization.externalId && !organization.id && !organization.name)) {
    return { ...caller, _created: false }
  }

  if (organization.id) {
    if (organization.id !== caller.id && caller.org_type !== 'platform') {
      throw new ApiError(403, 'forbidden', 'Only platform keys can provision into another org by id')
    }
    const { data, error } = await service
      .from('organizations')
      .select('id, tenant_id, name, org_type, external_id')
      .eq('id', organization.id)
      .maybeSingle()
    if (error) throw new ApiError(500, 'db_error', error.message)
    if (!data) throw new ApiError(404, 'not_found', 'Organization not found')
    if (data.tenant_id !== caller.tenant_id) {
      throw new ApiError(403, 'forbidden', 'Organization is outside caller tenant')
    }
    return { ...(data as OrgRow), _created: false }
  }

  if (organization.externalId) {
    const { data: existing, error } = await service
      .from('organizations')
      .select('id, tenant_id, name, org_type, external_id')
      .eq('tenant_id', caller.tenant_id)
      .eq('external_id', organization.externalId)
      .maybeSingle()
    if (error) throw new ApiError(500, 'db_error', error.message)

    if (existing) {
      if (existing.id !== caller.id && caller.org_type !== 'platform') {
        throw new ApiError(403, 'forbidden', 'Only platform keys can provision into another org')
      }
      if (organization.name && organization.name !== existing.name) {
        await service.from('organizations').update({ name: organization.name }).eq('id', existing.id)
        return { ...(existing as OrgRow), name: organization.name, _created: false }
      }
      return { ...(existing as OrgRow), _created: false }
    }

    if (caller.org_type !== 'platform') {
      throw new ApiError(403, 'forbidden', 'Only platform keys can create organizations')
    }
    if (!organization.name) {
      throw new ApiError(400, 'validation_error', 'organization.name required when creating org')
    }

    const { data: created, error: createError } = await service
      .from('organizations')
      .insert({
        tenant_id: caller.tenant_id,
        name: organization.name,
        org_type: organization.orgType ?? 'inspection',
        external_id: organization.externalId,
      })
      .select('id, tenant_id, name, org_type, external_id')
      .single()
    if (createError) throw new ApiError(400, 'db_error', createError.message)
    return { ...(created as OrgRow), _created: true }
  }

  if (organization.name) {
    if (caller.org_type !== 'platform') {
      throw new ApiError(403, 'forbidden', 'Only platform keys can create organizations')
    }
    const { data: created, error: createError } = await service
      .from('organizations')
      .insert({
        tenant_id: caller.tenant_id,
        name: organization.name,
        org_type: organization.orgType ?? 'inspection',
      })
      .select('id, tenant_id, name, org_type, external_id')
      .single()
    if (createError) throw new ApiError(400, 'db_error', createError.message)
    return { ...(created as OrgRow), _created: true }
  }

  return { ...caller, _created: false }
}
