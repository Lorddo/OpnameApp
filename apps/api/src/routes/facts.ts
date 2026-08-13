import { Hono } from 'hono'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { assertPropertyAccess, dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'

export const factsRoutes = new Hono<AppEnv>()
factsRoutes.use('*', requireAuth)

factsRoutes.get('/', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.query('propertyId')
  if (!propertyId) throw new ApiError(400, 'validation_error', 'propertyId is required')
  await assertPropertyAccess(db, auth, propertyId)

  const { data, error } = await db.from('facts').select('*').eq('property_id', propertyId)
  if (error) throw new ApiError(500, 'db_error', error.message)
  return c.json({ facts: data ?? [] })
})
