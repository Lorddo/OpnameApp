import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { assertPropertyAccess, dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'

export const propertiesRoutes = new Hono<AppEnv>()
propertiesRoutes.use('*', requireAuth)

const createPropertySchema = z.object({
  id: z.string().uuid().optional(),
  homeOrgId: z.string().uuid().optional(),
  postcode: z.string().min(1),
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

  if (error) throw new ApiError(500, 'db_error', error.message)
  return c.json({ properties: data ?? [] })
})

propertiesRoutes.post('/', async (c) => {
  const auth = c.get('auth')!
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
    if (memError) throw new ApiError(500, 'db_error', memError.message)
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
  if (error) throw new ApiError(400, 'db_error', error.message)
  return c.json({ property: data }, 201)
})

propertiesRoutes.get('/:id', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const id = c.req.param('id')
  await assertPropertyAccess(db, auth, id)

  const { data: property, error } = await db.from('properties').select('*').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!property) throw new ApiError(404, 'not_found', 'Property not found')

  const [floors, rooms, assets] = await Promise.all([
    db.from('floors').select('*').eq('property_id', id).order('sort_order'),
    db.from('rooms').select('*').eq('property_id', id).order('sort_order'),
    db.from('assets').select('*').eq('property_id', id),
  ])

  return c.json({
    property,
    floors: floors.data ?? [],
    rooms: rooms.data ?? [],
    assets: assets.data ?? [],
  })
})

const floorSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1),
  sortOrder: z.number().int().default(0),
})

propertiesRoutes.post('/:id/floors', async (c) => {
  const auth = c.get('auth')!
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

  if (error) throw new ApiError(400, 'db_error', error.message)
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

  if (error) throw new ApiError(400, 'db_error', error.message)
  return c.json({ room: data }, 201)
})

propertiesRoutes.delete('/:id/floors/:floorId', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  const floorId = c.req.param('floorId')
  await assertPropertyAccess(db, auth, propertyId)

  const { error } = await db.from('floors').delete().eq('id', floorId).eq('property_id', propertyId)
  if (error) throw new ApiError(400, 'db_error', error.message)
  return c.json({ ok: true })
})

propertiesRoutes.delete('/:id/rooms/:roomId', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  const roomId = c.req.param('roomId')
  await assertPropertyAccess(db, auth, propertyId)

  const { error } = await db.from('rooms').delete().eq('id', roomId).eq('property_id', propertyId)
  if (error) throw new ApiError(400, 'db_error', error.message)
  return c.json({ ok: true })
})
