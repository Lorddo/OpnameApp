import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { assertPropertyAccess, dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'

export const inspectionsRoutes = new Hono<AppEnv>()
inspectionsRoutes.use('*', requireAuth)

const createInspectionSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  clientOrgId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  status: z.enum(['draft', 'assigned', 'in_progress', 'completed', 'synced']).default('draft'),
  templates: z
    .array(
      z.object({
        templateKey: z.string().min(1),
        templateVersion: z.string().min(1),
      }),
    )
    .min(1),
})

inspectionsRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const { data, error } = await db
    .from('inspections')
    .select(
      'id, property_id, owner_org_id, client_org_id, inspector_id, assigned_user_id, status, started_at, completed_at, updated_at, inspection_template_pins(template_key, template_version)',
    )
    .eq('owner_org_id', auth.orgId)
    .order('updated_at', { ascending: false })

  if (error) throw new ApiError(500, 'db_error', error.message)
  return c.json({ inspections: data ?? [] })
})

inspectionsRoutes.post('/', async (c) => {
  const auth = c.get('auth')!
  const body = createInspectionSchema.parse(await c.req.json())
  const db = dbForAuth(c.env, auth)
  await assertPropertyAccess(db, auth, body.propertyId)

  const inspection = {
    id: body.id,
    property_id: body.propertyId,
    owner_org_id: auth.orgId,
    client_org_id: body.clientOrgId ?? null,
    inspector_id: auth.userId ?? null,
    assigned_user_id: body.assignedUserId ?? auth.userId ?? null,
    status: body.status,
    started_at: new Date().toISOString(),
  }

  const { data, error } = await db.from('inspections').insert(inspection).select('*').single()
  if (error) throw new ApiError(400, 'db_error', error.message)

  const pins = body.templates.map((t) => ({
    inspection_id: body.id,
    template_key: t.templateKey,
    template_version: t.templateVersion,
  }))
  const pinResult = await db.from('inspection_template_pins').insert(pins)
  if (pinResult.error) throw new ApiError(400, 'db_error', pinResult.error.message)

  return c.json({ inspection: data, pins }, 201)
})

inspectionsRoutes.get('/:id', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const { data, error } = await db
    .from('inspections')
    .select('*, inspection_template_pins(template_key, template_version)')
    .eq('id', c.req.param('id'))
    .maybeSingle()

  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!data) throw new ApiError(404, 'not_found', 'Inspection not found')
  if (data.owner_org_id !== auth.orgId) {
    throw new ApiError(403, 'forbidden', 'Outside organization scope')
  }
  return c.json({ inspection: data })
})

inspectionsRoutes.patch('/:id', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const body = z
    .object({
      status: z.enum(['draft', 'assigned', 'in_progress', 'completed', 'synced']).optional(),
      completedAt: z.string().datetime().optional().nullable(),
    })
    .parse(await c.req.json())

  const patch: Record<string, unknown> = {}
  if (body.status) patch.status = body.status
  if (body.completedAt !== undefined) patch.completed_at = body.completedAt

  const { data, error } = await db
    .from('inspections')
    .update(patch)
    .eq('id', c.req.param('id'))
    .eq('owner_org_id', auth.orgId)
    .select('*')
    .maybeSingle()

  if (error) throw new ApiError(400, 'db_error', error.message)
  if (!data) throw new ApiError(404, 'not_found', 'Inspection not found')
  return c.json({ inspection: data })
})
