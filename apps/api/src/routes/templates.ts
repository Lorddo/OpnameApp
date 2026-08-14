import { Hono } from 'hono'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'
import { ensureSeeded } from '../lib/seed-templates.js'

export const templatesRoutes = new Hono<AppEnv>()

templatesRoutes.use('*', requireAuth)

templatesRoutes.get('/', async (c) => {
  await ensureSeeded(c.env)
  const db = dbForAuth(c.env, c.get('auth')!)
  const { data, error } = await db
    .from('inspection_templates')
    .select('template_key, version, label, locale, published_at')
    .order('template_key')
    .order('version')

  if (error) throw new ApiError(500, 'db_error', error.message)
  return c.json({ templates: data ?? [] })
})

templatesRoutes.get('/:key/:version', async (c) => {
  await ensureSeeded(c.env)
  const db = dbForAuth(c.env, c.get('auth')!)
  const { data, error } = await db
    .from('inspection_templates')
    .select('template_key, version, label, locale, config, published_at')
    .eq('template_key', c.req.param('key'))
    .eq('version', c.req.param('version'))
    .maybeSingle()

  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!data) throw new ApiError(404, 'not_found', 'Template not found')
  return c.json({ template: data })
})
