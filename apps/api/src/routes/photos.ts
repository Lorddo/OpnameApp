import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import {
  assertPhotoReadAccess,
  assertPropertyAccess,
  assertPwaWrite,
  dbForAuth,
} from '../lib/db.js'
import { ApiError } from '../lib/errors.js'
import { throwIfDbError, requireRow } from '../lib/db-result.js'
import { applyPhotoOwnerScope } from '../lib/scope.js'
import { scheduleWebhookEnqueue } from '../lib/webhook-schedule.js'

export const photosRoutes = new Hono<AppEnv>()
photosRoutes.use('*', requireAuth)

const createPhotoSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  observationId: z.string().uuid().optional().nullable(),
  subjectType: z.enum(['property', 'floor', 'room', 'asset']).optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  contentType: z.string().default('image/jpeg'),
  checksum: z.string().optional().nullable(),
  sourceInspectionId: z.string().uuid().optional().nullable(),
})

photosRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.query('propertyId')
  const inspectionId = c.req.query('inspectionId')
  if (!propertyId) throw new ApiError(400, 'validation_error', 'propertyId is required')
  await assertPropertyAccess(db, auth, propertyId)

  let query = db
    .from('photos')
    .select(
      'id, property_id, observation_id, subject_type, subject_id, storage_provider, storage_key, checksum, source_inspection_id, uploaded_at, created_at, owner_org_id',
    )
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true })

  query = applyPhotoOwnerScope(query, auth)

  if (inspectionId) query = query.eq('source_inspection_id', inspectionId)

  const { data, error } = await query
  throwIfDbError(error)
  return c.json({ photos: data ?? [] })
})

photosRoutes.post('/upload-url', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const body = createPhotoSchema.parse(await c.req.json())
  await assertPropertyAccess(db, auth, body.propertyId)

  const storageKey = `photos/${auth.orgId}/${body.propertyId}/${body.id}`
  const { data, error } = await db
    .from('photos')
    .upsert({
      id: body.id,
      property_id: body.propertyId,
      observation_id: body.observationId ?? null,
      subject_type: body.subjectType ?? null,
      subject_id: body.subjectId ?? null,
      owner_org_id: auth.orgId,
      visibility: 'private',
      storage_provider: 'r2',
      storage_key: storageKey,
      checksum: body.checksum ?? null,
      source_inspection_id: body.sourceInspectionId ?? null,
    })
    .select('*')
    .single()

  throwIfDbError(error, 400)

  return c.json({
    photo: data,
    upload: {
      method: 'PUT',
      url: `/api/photos/${body.id}/content`,
      headers: {
        'Content-Type': body.contentType,
      },
    },
  })
})

photosRoutes.put('/:id/content', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const id = c.req.param('id')

  const { data: photo, error } = await db.from('photos').select('*').eq('id', id).maybeSingle()
  throwIfDbError(error)
  requireRow(photo, 'Photo not found')
  if (photo.owner_org_id !== auth.orgId) throw new ApiError(403, 'forbidden', 'Outside organization scope')

  const bytes = await c.req.arrayBuffer()
  await c.env.PHOTOS_BUCKET.put(photo.storage_key, bytes, {
    httpMetadata: {
      contentType: c.req.header('Content-Type') ?? 'image/jpeg',
    },
  })

  const uploadedAt = new Date().toISOString()
  await db.from('photos').update({ uploaded_at: uploadedAt }).eq('id', id)

  const sourceInspectionId = photo.source_inspection_id as string | null
  if (sourceInspectionId) {
    scheduleWebhookEnqueue(c, sourceInspectionId, 'webhook_enqueue_after_photo')
  }

  return c.json({ ok: true, storageKey: photo.storage_key, uploadedAt })
})

photosRoutes.get('/:id/content', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const id = c.req.param('id')

  const { data: photo, error } = await db.from('photos').select('*').eq('id', id).maybeSingle()
  throwIfDbError(error)
  requireRow(photo, 'Photo not found')
  await assertPhotoReadAccess(db, auth, {
    owner_org_id: photo.owner_org_id as string,
    property_id: photo.property_id as string,
    source_inspection_id: (photo.source_inspection_id as string | null) ?? null,
  })

  const object = await c.env.PHOTOS_BUCKET.get(photo.storage_key)
  if (!object) throw new ApiError(404, 'not_found', 'Photo content not found')

  const contentType = object.httpMetadata?.contentType ?? 'image/jpeg'
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

photosRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const id = c.req.param('id')

  const { data: photo, error } = await db.from('photos').select('*').eq('id', id).maybeSingle()
  throwIfDbError(error)
  requireRow(photo, 'Photo not found')
  if (photo.owner_org_id !== auth.orgId) {
    throw new ApiError(403, 'forbidden', 'Outside organization scope')
  }
  await assertPropertyAccess(db, auth, photo.property_id as string)

  const storageKey = photo.storage_key as string | null
  if (storageKey) {
    await c.env.PHOTOS_BUCKET.delete(storageKey)
  }

  const { error: deleteError } = await db.from('photos').delete().eq('id', id)
  throwIfDbError(deleteError, 400)

  const sourceInspectionId = photo.source_inspection_id as string | null
  if (sourceInspectionId) {
    scheduleWebhookEnqueue(c, sourceInspectionId, 'webhook_enqueue_after_photo_delete')
  }

  return c.json({ ok: true })
})
