import type { Context } from 'hono'
import type { AppEnv } from '../index.js'
import type { AuthContext } from './auth.js'
import { ApiError } from './errors.js'

export function getAuth(c: Context<AppEnv>): AuthContext {
  const auth = c.get('auth')
  if (!auth) throw new ApiError(401, 'unauthorized', 'Not authenticated')
  return auth
}
