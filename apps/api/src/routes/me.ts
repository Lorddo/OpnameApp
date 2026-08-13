import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { createServiceClient } from '../lib/supabase.js'
import { ApiError } from '../lib/errors.js'
import { generateApiKey, hashApiKey } from '../lib/auth.js'

export const meRoutes = new Hono<AppEnv>()
meRoutes.use('*', requireAuth)

meRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  return c.json({
    auth: {
      kind: auth.kind,
      userId: auth.userId ?? null,
      orgId: auth.orgId,
      orgRole: auth.orgRole ?? null,
      apiKeyId: auth.apiKeyId ?? null,
    },
  })
})

const createKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).default([]),
})

/** Platform/org admins can mint dashboard API keys (hashed at rest). */
meRoutes.post('/api-keys', async (c) => {
  const auth = c.get('auth')!
  if (auth.kind !== 'user' || auth.orgRole !== 'admin') {
    throw new ApiError(403, 'forbidden', 'Only org admins can create API keys')
  }

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

  if (error) throw new ApiError(400, 'db_error', error.message)

  return c.json({
    apiKey: data,
    secret: rawKey,
    warning: 'Store the secret now; it will not be shown again.',
  }, 201)
})
