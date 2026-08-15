import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import {
  assertInspectionReadAccess,
  assertPropertyAccess,
  assertPwaWrite,
  dbForAuth,
} from '../lib/db.js'
import { ApiError } from '../lib/errors.js'
import { throwIfDbError, requireRow } from '../lib/db-result.js'
import { writeTemplatePins } from '../lib/pins.js'
import { applyInspectionListScope } from '../lib/scope.js'
import { inspectionStatusSchema, templatePinSchema, INSPECTION_STATUSES } from '../lib/schemas.js'
import { scheduleWebhookEnqueue } from '../lib/webhook-schedule.js'

export const inspectionsRoutes = new Hono<AppEnv>()
inspectionsRoutes.use('*', requireAuth)

const createInspectionSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  clientOrgId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  status: inspectionStatusSchema.default('draft'),
  templates: z.array(templatePinSchema).min(1),
})

inspectionsRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const status = c.req.query('status')
  const updatedSince = c.req.query('updatedSince')

  let query = db
    .from('inspections')
    .select(
      'id, property_id, owner_org_id, client_org_id, inspector_id, assigned_user_id, status, started_at, completed_at, updated_at, inspection_template_pins(template_key, template_version)',
    )
    .order('updated_at', { ascending: false })

  const scoped = await applyInspectionListScope(query, db, auth)
  if (scoped.empty) return c.json({ inspections: [] })
  query = scoped.query

  if (status) {
    if (!(INSPECTION_STATUSES as readonly string[]).includes(status)) {
      throw new ApiError(400, 'validation_error', `Invalid status: ${status}`)
    }
    query = query.eq('status', status)
  }
  if (updatedSince) {
    query = query.gt('updated_at', updatedSince)
  }

  const { data, error } = await query
  throwIfDbError(error)
  return c.json({ inspections: data ?? [] })
})

inspectionsRoutes.post('/', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
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
  throwIfDbError(error, 400)

  await writeTemplatePins(db, body.id, body.templates, 'insert')

  return c.json({ inspection: data, pins: body.templates }, 201)
})

inspectionsRoutes.get('/:id', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const { data, error } = await db
    .from('inspections')
    .select('*, inspection_template_pins(template_key, template_version)')
    .eq('id', c.req.param('id'))
    .maybeSingle()

  throwIfDbError(error)
  requireRow(data, 'Inspection not found')
  await assertInspectionReadAccess(db, auth, {
    id: data.id as string,
    owner_org_id: data.owner_org_id as string,
    client_org_id: (data.client_org_id as string | null) ?? null,
    property_id: data.property_id as string,
  })
  return c.json({ inspection: data })
})

inspectionsRoutes.patch('/:id', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const body = z
    .object({
      status: inspectionStatusSchema.optional(),
      completedAt: z.string().datetime().optional().nullable(),
      templates: z.array(templatePinSchema).min(1).optional(),
    })
    .parse(await c.req.json())

  const patch: Record<string, unknown> = {}
  if (body.status) patch.status = body.status
  if (body.completedAt !== undefined) patch.completed_at = body.completedAt

  const inspectionId = c.req.param('id')
  let data: Record<string, unknown> | null = null
  if (Object.keys(patch).length) {
    const result = await db
      .from('inspections')
      .update(patch)
      .eq('id', inspectionId)
      .eq('owner_org_id', auth.orgId)
      .select('*')
      .maybeSingle()
    throwIfDbError(result.error, 400)
    data = result.data
  } else {
    const result = await db
      .from('inspections')
      .select('*')
      .eq('id', inspectionId)
      .eq('owner_org_id', auth.orgId)
      .maybeSingle()
    throwIfDbError(result.error)
    data = result.data
  }

  const inspection = requireRow(data, 'Inspection not found')

  if (body.templates) {
    await writeTemplatePins(db, inspection.id as string, body.templates, 'replace')
  }

  if (body.status === 'completed') {
    scheduleWebhookEnqueue(c, inspection.id as string, 'webhook_enqueue_after_complete')
  }

  return c.json({ inspection })
})
