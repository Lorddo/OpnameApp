import { Hono } from 'hono'
import type { AppEnv } from '../../index.js'
import { createServiceClient } from '../../lib/supabase.js'
import { ApiError } from '../../lib/errors.js'
import { assertDashboardCaller, assertScope } from '../../lib/admin.js'
import { evaluateInspectionReadinessFromDb } from '../../lib/inspection-readiness.js'
import { replayDelivery } from '../../lib/webhooks.js'
import { throwIfDbError } from '../../lib/db-result.js'

export const webhooksAdminRoutes = new Hono<AppEnv>()

webhooksAdminRoutes.get('/webhooks/status', async (c) => {
  const auth = c.get('auth')!
  assertDashboardCaller(auth)
  assertScope(auth, 'webhooks:read')

  const inspectionId = c.req.query('inspectionId')
  if (!inspectionId) throw new ApiError(400, 'validation_error', 'inspectionId is required')

  const service = createServiceClient(c.env)
  const readiness = await evaluateInspectionReadinessFromDb(service, inspectionId)
  if (!readiness) throw new ApiError(404, 'not_found', 'Inspection not found')

  const { data: deliveries, error } = await service
    .from('webhook_deliveries')
    .select(
      'id, event_type, dedupe_key, status, attempt_count, next_attempt_at, last_status_code, last_error, delivered_at, created_at, payload',
    )
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false })

  throwIfDbError(error)

  return c.json({
    inspectionId,
    ready: readiness.ready,
    reasons: readiness.reasons,
    photoCount: readiness.photoCount,
    pendingUploadCount: readiness.pendingUploadCount,
    completeness: readiness.completeness,
    deliveries: deliveries ?? [],
  })
})

webhooksAdminRoutes.post('/webhooks/:id/replay', async (c) => {
  const auth = c.get('auth')!
  assertDashboardCaller(auth)
  assertScope(auth, 'webhooks:write')

  const id = c.req.param('id')
  try {
    const delivery = await replayDelivery(c.env, id)
    return c.json({ delivery })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'Delivery not found') throw new ApiError(404, 'not_found', message)
    throw new ApiError(500, 'webhook_error', message)
  }
})
