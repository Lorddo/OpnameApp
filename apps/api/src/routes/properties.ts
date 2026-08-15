import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { assertPropertyAccess, assertPwaWrite, dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'
import { throwIfDbError, requireRow } from '../lib/db-result.js'
import { loadPropertyStructure } from '../lib/property-bundle.js'
import { nlPostcodeSchema } from '../lib/schemas.js'

export const propertiesRoutes = new Hono<AppEnv>()
propertiesRoutes.use('*', requireAuth)

const createPropertySchema = z.object({
  id: z.string().uuid().optional(),
  homeOrgId: z.string().uuid().optional(),
  postcode: nlPostcodeSchema,
  houseNumber: z.string().min(1),
  houseNumberAddition: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  propertyType: z.string().optional().nullable(),
  buildYear: z.number().int().optional().nullable(),
  bagId: z.string().optional().nullable(),
})

propertiesRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const { data, error } = await db
    .from('properties')
    .select(
      'id, home_org_id, created_by_org_id, postcode, house_number, house_number_addition, city, property_type, build_year, bag_id, updated_at',
    )
    .or(`home_org_id.eq.${auth.orgId},created_by_org_id.eq.${auth.orgId}`)
    .order('updated_at', { ascending: false })

  throwIfDbError(error)
  return c.json({ properties: data ?? [] })
})

propertiesRoutes.post('/', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const body = createPropertySchema.parse(await c.req.json())
  const db = dbForAuth(c.env, auth)
  const homeOrgId = body.homeOrgId ?? auth.orgId

  if (auth.kind === 'user' && auth.userId) {
    const { data: membership, error: memError } = await db
      .from('org_members')
      .select('id')
      .eq('org_id', auth.orgId)
      .eq('user_id', auth.userId)
      .maybeSingle()
    throwIfDbError(memError)
    if (!membership) {
      throw new ApiError(403, 'forbidden', 'Not a member of this organization')
    }
  }

  const row = {
    id: body.id,
    home_org_id: homeOrgId,
    created_by_org_id: auth.orgId,
    postcode: body.postcode,
    house_number: body.houseNumber,
    house_number_addition: body.houseNumberAddition ?? null,
    city: body.city ?? null,
    property_type: body.propertyType ?? null,
    build_year: body.buildYear ?? null,
    bag_id: body.bagId ?? null,
  }

  const { data, error } = await db.from('properties').insert(row).select('*').single()
  throwIfDbError(error, 400)
  return c.json({ property: data }, 201)
})

propertiesRoutes.get('/:id', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const id = c.req.param('id')
  await assertPropertyAccess(db, auth, id)

  const { data: property, error } = await db.from('properties').select('*').eq('id', id).maybeSingle()
  throwIfDbError(error)
  requireRow(property, 'Property not found')

  const structure = await loadPropertyStructure(db, id)

  return c.json({
    property,
    ...structure,
  })
})

const floorSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1),
  sortOrder: z.number().int().default(0),
})

propertiesRoutes.post('/:id/floors', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  await assertPropertyAccess(db, auth, propertyId)
  const body = floorSchema.parse(await c.req.json())

  const { data, error } = await db
    .from('floors')
    .insert({
      id: body.id,
      property_id: propertyId,
      label: body.label,
      sort_order: body.sortOrder,
    })
    .select('*')
    .single()

  throwIfDbError(error, 400)
  return c.json({ floor: data }, 201)
})

const roomSchema = z.object({
  id: z.string().uuid().optional(),
  floorId: z.string().uuid(),
  roomType: z.string().min(1),
  label: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
})

propertiesRoutes.post('/:id/rooms', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  await assertPropertyAccess(db, auth, propertyId)
  const body = roomSchema.parse(await c.req.json())

  const { data, error } = await db
    .from('rooms')
    .insert({
      id: body.id,
      property_id: propertyId,
      floor_id: body.floorId,
      room_type: body.roomType,
      label: body.label ?? null,
      sort_order: body.sortOrder,
    })
    .select('*')
    .single()

  throwIfDbError(error, 400)
  return c.json({ room: data }, 201)
})

propertiesRoutes.delete('/:id/floors/:floorId', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  const floorId = c.req.param('floorId')
  await assertPropertyAccess(db, auth, propertyId)

  const { error } = await db.from('floors').delete().eq('id', floorId).eq('property_id', propertyId)
  throwIfDbError(error, 400)
  return c.json({ ok: true })
})

propertiesRoutes.delete('/:id/rooms/:roomId', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  const roomId = c.req.param('roomId')
  await assertPropertyAccess(db, auth, propertyId)

  const { error } = await db.from('rooms').delete().eq('id', roomId).eq('property_id', propertyId)
  throwIfDbError(error, 400)
  return c.json({ ok: true })
})

const assetSchema = z.object({
  id: z.string().uuid().optional(),
  floorId: z.string().uuid().optional().nullable(),
  assetType: z.string().min(1),
  label: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
})

propertiesRoutes.post('/:id/assets', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  await assertPropertyAccess(db, auth, propertyId)
  const body = assetSchema.parse(await c.req.json())

  if (body.floorId) {
    const { data: floor, error: floorError } = await db
      .from('floors')
      .select('id')
      .eq('id', body.floorId)
      .eq('property_id', propertyId)
      .maybeSingle()
    throwIfDbError(floorError)
    if (!floor) {
      throw new ApiError(400, 'invalid_floor', 'floor_id must belong to the same property')
    }
  }

  const { data, error } = await db
    .from('assets')
    .insert({
      id: body.id,
      property_id: propertyId,
      floor_id: body.floorId ?? null,
      asset_type: body.assetType,
      label: body.label ?? null,
      sort_order: body.sortOrder,
    })
    .select('*')
    .single()

  throwIfDbError(error, 400)
  return c.json({ asset: data }, 201)
})

propertiesRoutes.delete('/:id/assets/:assetId', async (c) => {
  const auth = c.get('auth')!
  assertPwaWrite(auth)
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  const assetId = c.req.param('assetId')
  await assertPropertyAccess(db, auth, propertyId)

  const { error } = await db.from('assets').delete().eq('id', assetId).eq('property_id', propertyId)
  throwIfDbError(error, 400)
  return c.json({ ok: true })
})
