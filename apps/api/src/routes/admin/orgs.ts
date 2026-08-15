import { Hono } from 'hono'
import type { AppEnv } from '../../index.js'
import { createServiceClient } from '../../lib/supabase.js'
import { assertPlatformCaller } from '../../lib/admin.js'
import { throwIfDbError } from '../../lib/db-result.js'

export const orgsRoutes = new Hono<AppEnv>()

orgsRoutes.get('/organizations', async (c) => {
  const auth = c.get('auth')!
  const caller = await assertPlatformCaller(c.env, auth)
  const service = createServiceClient(c.env)

  const { data, error } = await service
    .from('organizations')
    .select('id, name, org_type, external_id, created_at')
    .eq('tenant_id', caller.tenant_id)
    .order('name')

  throwIfDbError(error)

  return c.json({
    organizations: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      orgType: row.org_type,
      externalId: row.external_id,
      createdAt: row.created_at,
    })),
  })
})
