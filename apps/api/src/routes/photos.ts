import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { assertPropertyAccess, dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'

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
      'id, property_id, observation_id, subject_type, subject_id, storage_provider, storage_key, checksum, source_inspection_id, created_at',
    )
    .eq('property_id', propertyId)
    .eq('owner_org_id', auth.orgId)
    .order('created_at', { ascending: true })

  if (inspectionId) query = query.eq('source_inspection_id', inspectionId)

  const { data, error } = await query
  if (error) throw new ApiError(500, 'db_error', error.message)
  return c.json({ photos: data ?? [] })
})

photosRoutes.post('/upload-url', async (c) => {
  const auth = c.get('auth')!
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

  if (error) throw new ApiError(400, 'db_error', error.message)

  // R2 binding supports createMultipartUpload; for MVP use a Worker-mediated PUT via temporary token
  // or signed URL from S3 API. Here we return a same-origin upload endpoint for the worker.
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
  const db = dbForAuth(c.env, auth)
  const id = c.req.param('id')

  const { data: photo, error } = await db.from('photos').select('*').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!photo) throw new ApiError(404, 'not_found', 'Photo not found')
  if (photo.owner_org_id !== auth.orgId) throw new ApiError(403, 'forbidden', 'Outside organization scope')

  const bytes = await c.req.arrayBuffer()
  await c.env.PHOTOS_BUCKET.put(photo.storage_key, bytes, {
    httpMetadata: {
      contentType: c.req.header('Content-Type') ?? 'image/jpeg',
    },
  })

  return c.json({ ok: true, storageKey: photo.storage_key })
})

photosRoutes.get('/:id/content', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const id = c.req.param('id')

  const { data: photo, error } = await db.from('photos').select('*').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!photo) throw new ApiError(404, 'not_found', 'Photo not found')
  if (photo.owner_org_id !== auth.orgId) throw new ApiError(403, 'forbidden', 'Outside organization scope')

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
