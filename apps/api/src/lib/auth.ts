import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { OrgRole, OrgType } from '@opnameapp/core'
import type { Env } from '../env.js'
import { supabasePublishableKey } from '../env.js'
import { createServiceClient } from './supabase.js'
import { ApiError } from './errors.js'

export type AuthKind = 'user' | 'api_key'

export type AuthContext = {
  kind: AuthKind
  userId?: string
  orgId: string
  orgRole?: OrgRole
  orgType?: OrgType
  tenantId?: string
  accessToken?: string
  apiKeyId?: string
  scopes?: string[]
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(supabaseUrl: string) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
  let jwks = jwksCache.get(url)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url))
    jwksCache.set(url, jwks)
  }
  return jwks
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type JwtAppMetadata = {
  org_id?: string
  org_role?: string
  org_ids?: string[]
}

async function verifyJwt(env: Env, token: string) {
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`

  try {
    const { payload } = await jwtVerify(token, getJwks(env.SUPABASE_URL), {
      issuer,
    })
    return payload
  } catch (jwksError) {
    // Projects still on shared HS256 secret (local demo / legacy).
    if (env.SUPABASE_JWT_SECRET) {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), {
        issuer,
      })
      return payload
    }

    // Last resort: ask Auth server (works for HS256 without exposing secret in edge).
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: supabasePublishableKey(env),
        Authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) {
      throw jwksError
    }
    const user = (await res.json()) as { id?: string; app_metadata?: JwtAppMetadata; role?: string }
    return {
      sub: user.id,
      role: user.role ?? 'authenticated',
      app_metadata: user.app_metadata,
    }
  }
}

export async function authenticateRequest(env: Env, authorizationHeader: string | undefined): Promise<AuthContext> {
  if (!authorizationHeader) {
    throw new ApiError(401, 'unauthorized', 'Missing Authorization header')
  }

  const [scheme, token] = authorizationHeader.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    throw new ApiError(401, 'unauthorized', 'Expected Bearer token')
  }

  if (token.startsWith('opk_')) {
    return authenticateApiKey(env, token)
  }

  const payload = await verifyJwt(env, token).catch(() => {
    throw new ApiError(401, 'unauthorized', 'Invalid or expired token')
  })

  const appMetadata = (payload.app_metadata ?? {}) as JwtAppMetadata
  const orgId = appMetadata.org_id
  if (!orgId) {
    throw new ApiError(403, 'forbidden', 'JWT missing app_metadata.org_id')
  }

  const orgRole = appMetadata.org_role === 'admin' ? 'admin' : 'inspector'
  const userId = typeof payload.sub === 'string' ? payload.sub : undefined
  if (!userId) {
    throw new ApiError(401, 'unauthorized', 'JWT missing subject')
  }

  const service = createServiceClient(env)
  const { data: orgRow } = await service
    .from('organizations')
    .select('org_type, tenant_id')
    .eq('id', orgId)
    .maybeSingle()

  const orgType: OrgType =
    orgRow?.org_type === 'client' || orgRow?.org_type === 'platform' || orgRow?.org_type === 'inspection'
      ? (orgRow.org_type as OrgType)
      : 'inspection'

  return {
    kind: 'user',
    userId,
    orgId,
    orgRole,
    orgType,
    tenantId: typeof orgRow?.tenant_id === 'string' ? orgRow.tenant_id : undefined,
    accessToken: token,
  }
}

async function authenticateApiKey(env: Env, rawKey: string): Promise<AuthContext> {
  // Format: opk_<prefix>_<secret>
  const parts = rawKey.split('_')
  if (parts.length < 3 || parts[0] !== 'opk') {
    throw new ApiError(401, 'unauthorized', 'Malformed API key')
  }
  const prefix = parts[1]!
  const hash = await sha256Hex(rawKey)
  const service = createServiceClient(env)

  const { data, error } = await service
    .from('api_keys')
    .select('id, org_id, key_hash, revoked_at, scopes, organizations(org_type, tenant_id)')
    .eq('key_prefix', prefix)
    .maybeSingle()

  if (error || !data || data.revoked_at || data.key_hash !== hash) {
    throw new ApiError(401, 'unauthorized', 'Invalid API key')
  }

  void service
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  const org = data.organizations as
    | { org_type?: string; tenant_id?: string }
    | { org_type?: string; tenant_id?: string }[]
    | null
  const orgRow = Array.isArray(org) ? org[0] : org
  const orgType =
    orgRow?.org_type === 'client' || orgRow?.org_type === 'platform' || orgRow?.org_type === 'inspection'
      ? (orgRow.org_type as OrgType)
      : 'inspection'

  return {
    kind: 'api_key',
    orgId: data.org_id as string,
    apiKeyId: data.id as string,
    scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : [],
    orgType,
    tenantId: typeof orgRow?.tenant_id === 'string' ? orgRow.tenant_id : undefined,
  }
}

export async function hashApiKey(rawKey: string): Promise<string> {
  return sha256Hex(rawKey)
}

export function generateApiKey(): { rawKey: string; prefix: string } {
  const prefix = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  return { rawKey: `opk_${prefix}_${secret}`, prefix }
}
