import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'

export const observationsRoutes = new Hono<AppEnv>()
observationsRoutes.use('*', requireAuth)

const observationSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  inspectionId: z.string().uuid(),
  attributeKey: z.string().min(1),
  subjectType: z.enum(['property', 'floor', 'room', 'asset']),
  subjectId: z.string().uuid(),
  value: z.unknown(),
  observedAt: z.string().datetime().optional(),
  visibility: z.enum(['private', 'shared', 'public_to_client']).default('private'),
  deviceId: z.string().optional().nullable(),
})

const batchSchema = z.object({
  observations: z.array(observationSchema).min(1),
})

observationsRoutes.post('/batch', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const body = batchSchema.parse(await c.req.json())

  const rows = body.observations.map((o) => ({
    id: o.id,
    property_id: o.propertyId,
    inspection_id: o.inspectionId,
    attribute_key: o.attributeKey,
    subject_type: o.subjectType,
    subject_id: o.subjectId,
    value: o.value,
    observed_at: o.observedAt ?? new Date().toISOString(),
    observer_id: auth.userId ?? null,
    owner_org_id: auth.orgId,
    visibility: o.visibility,
    device_id: o.deviceId ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await db
    .from('observations')
    .upsert(rows, { onConflict: 'id' })
    .select('id')

  if (error) throw new ApiError(400, 'db_error', error.message)
  return c.json({ upserted: data?.length ?? 0, ids: (data ?? []).map((r) => r.id) })
})

observationsRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const inspectionId = c.req.query('inspectionId')
  const propertyId = c.req.query('propertyId')

  let query = db.from('observations').select('*').order('updated_at', { ascending: false })
  if (inspectionId) query = query.eq('inspection_id', inspectionId)
  if (propertyId) query = query.eq('property_id', propertyId)
  query = query.eq('owner_org_id', auth.orgId)

  const { data, error } = await query
  if (error) throw new ApiError(500, 'db_error', error.message)
  return c.json({ observations: data ?? [] })
})
