import type { Context } from 'hono'
import type { AppEnv } from '../index.js'
import { enqueueCompletedEvent } from './webhooks.js'

/** Fire-and-forget webhook enqueue after inspection data changes. */
export function scheduleWebhookEnqueue(c: Context<AppEnv>, inspectionId: string, msg: string) {
  c.executionCtx.waitUntil(
    enqueueCompletedEvent(c.env, inspectionId).catch((err) => {
      console.error(
        JSON.stringify({
          level: 'error',
          msg,
          inspectionId,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }),
  )
}
