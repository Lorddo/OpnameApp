import { Hono } from 'hono'
import type { AppEnv } from '../index.js'

export const healthRoutes = new Hono<AppEnv>()

healthRoutes.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'opnameapp-api',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
    photosBucketBound: Boolean(c.env.PHOTOS_BUCKET),
  })
})
