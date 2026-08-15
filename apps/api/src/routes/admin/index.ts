import { Hono } from 'hono'
import type { AppEnv } from '../../index.js'
import { requireAuth } from '../../middleware/auth.js'
import { orgsRoutes } from './orgs.js'
import { provisionRoutes } from './provision.js'
import { assignInspectionRoutes } from './assign-inspection.js'
import { webhooksAdminRoutes } from './webhooks.js'

export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('*', requireAuth)
adminRoutes.route('/', orgsRoutes)
adminRoutes.route('/', provisionRoutes)
adminRoutes.route('/', assignInspectionRoutes)
adminRoutes.route('/', webhooksAdminRoutes)
