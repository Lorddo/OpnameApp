import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { createServiceClient } from '../lib/supabase.js'
import { generateApiKey, hashApiKey } from '../lib/auth.js'
import { assertOrgAdminJwt } from '../lib/admin.js'
import { throwIfDbError } from '../lib/db-result.js'

export const meRoutes = new Hono<AppEnv>()
meRoutes.use('*', requireAuth)

meRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  const service = createServiceClient(c.env)
  const { data: org } = await service
    .from('organizations')
    .select('id, name, org_type, external_id')
    .eq('id', auth.orgId)
    .maybeSingle()

  return c.json({
    auth: {
      kind: auth.kind,
      userId: auth.userId ?? null,
      orgId: auth.orgId,
      orgRole: auth.orgRole ?? null,
      apiKeyId: auth.apiKeyId ?? null,
    },
    organization: org
      ? {
          id: org.id,
          name: org.name,
          orgType: org.org_type,
          externalId: org.external_id,
        }
      : null,
  })
})

const createKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).default([]),
})

/** Platform/org admins can mint dashboard API keys (hashed at rest). */
meRoutes.post('/api-keys', async (c) => {
  const auth = c.get('auth')!
  assertOrgAdminJwt(auth)

  const body = createKeySchema.parse(await c.req.json())
  const { rawKey, prefix } = generateApiKey()
  const keyHash = await hashApiKey(rawKey)
  const service = createServiceClient(c.env)

  const { data, error } = await service
    .from('api_keys')
    .insert({
      org_id: auth.orgId,
      name: body.name,
      key_prefix: prefix,
      key_hash: keyHash,
      scopes: body.scopes,
    })
    .select('id, org_id, name, key_prefix, scopes, created_at')
    .single()

  throwIfDbError(error, 400)

  return c.json({
    apiKey: data,
    secret: rawKey,
    warning: 'Store the secret now; it will not be shown again.',
  }, 201)
})
