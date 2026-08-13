import type { AppEnv } from '../index.js'
import type { MiddlewareHandler } from 'hono'
import { authenticateRequest } from '../lib/auth.js'

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = await authenticateRequest(c.env, c.req.header('Authorization'))
  c.set('auth', auth)
  await next()
}
