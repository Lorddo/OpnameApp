import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'

export const assignmentsRoutes = new Hono<AppEnv>()
assignmentsRoutes.use('*', requireAuth)

const assignmentSchema = z.object({
  propertyId: z.string().uuid(),
  orgId: z.string().uuid(),
  role: z.enum(['inspector', 'viewer']).default('inspector'),
  activeFrom: z.string().datetime().optional(),
  activeTo: z.string().datetime().optional().nullable(),
})

assignmentsRoutes.post('/', async (c) => {
  const auth = c.get('auth')!
  if (!auth) throw new ApiError(401, 'unauthorized', 'Not authenticated')
  if (auth.kind === 'user' && auth.orgRole !== 'admin') {
    throw new ApiError(403, 'forbidden', 'Admin or API key required')
  }

  const body = assignmentSchema.parse(await c.req.json())
  const db = dbForAuth(c.env, auth)

  const { data, error } = await db
    .from('property_assignments')
    .upsert(
      {
        property_id: body.propertyId,
        org_id: body.orgId,
        role: body.role,
        active_from: body.activeFrom ?? new Date().toISOString(),
        active_to: body.activeTo ?? null,
      },
      { onConflict: 'property_id,org_id' },
    )
    .select('*')
    .single()

  if (error) throw new ApiError(400, 'db_error', error.message)
  return c.json({ assignment: data }, 201)
})
