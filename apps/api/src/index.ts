import { Hono } from 'hono'
import type { Env } from './env.js'
import { ApiError } from './lib/errors.js'
import type { AuthContext } from './lib/auth.js'
import { drainDueDeliveries, sweepReadyCompleted } from './lib/webhooks.js'
import { openApiDocument } from './openapi.js'
import { healthRoutes } from './routes/health.js'
import { templatesRoutes } from './routes/templates.js'
import { propertiesRoutes } from './routes/properties.js'
import { inspectionsRoutes } from './routes/inspections.js'
import { observationsRoutes } from './routes/observations.js'
import { factsRoutes } from './routes/facts.js'
import { photosRoutes } from './routes/photos.js'
import { exportsRoutes } from './routes/exports.js'
import { meRoutes } from './routes/me.js'
import { adminRoutes } from './routes/admin/index.js'
import { assignmentsRoutes } from './routes/assignments.js'
import { syncRoutes } from './routes/sync.js'

export type AppVariables = {
  requestId: string
  auth?: AuthContext
}

export type AppEnv = {
  Bindings: Env
  Variables: AppVariables
}

export { ApiError }

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set('requestId', requestId)
    const started = Date.now()
    await next()
    const durationMs = Date.now() - started
    console.log(
      JSON.stringify({
        level: 'info',
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs,
      }),
    )
  })

  app.use('*', async (c, next) => {
    const origin = c.env.CORS_ORIGIN ?? '*'
    const allowHeaders = 'Authorization,Content-Type,X-Request-Id,X-Api-Key'
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': allowHeaders,
        'Access-Control-Max-Age': '86400',
      })
    }
    await next()
    c.res.headers.set('Access-Control-Allow-Origin', origin)
    c.res.headers.set('Access-Control-Allow-Headers', allowHeaders)
    c.res.headers.set('X-Request-Id', c.get('requestId'))
  })

  app.route('/api', healthRoutes)
  app.route('/api/me', meRoutes)
  app.route('/api/templates', templatesRoutes)
  app.route('/api/properties', propertiesRoutes)
  app.route('/api/inspections', inspectionsRoutes)
  app.route('/api/observations', observationsRoutes)
  app.route('/api/facts', factsRoutes)
  app.route('/api/photos', photosRoutes)
  app.route('/api/exports', exportsRoutes)
  app.route('/api/assignments', assignmentsRoutes)
  app.route('/api/admin', adminRoutes)
  app.route('/api/sync', syncRoutes)

  app.get('/api/openapi.json', (c) => c.json(openApiDocument()))

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: 'not_found',
          message: `No route for ${c.req.method} ${c.req.path}`,
          requestId: c.get('requestId'),
        },
      },
      404,
    ),
  )

  app.onError((err, c) => {
    const requestId = c.get('requestId')
    if (err instanceof ApiError) {
      return c.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
            requestId,
          },
        },
        err.status,
      )
    }

    console.error(
      JSON.stringify({
        level: 'error',
        requestId,
        message: err instanceof Error ? err.message : String(err),
      }),
    )

    return c.json(
      {
        error: {
          code: 'internal_error',
          message: 'Unexpected server error',
          requestId,
        },
      },
      500,
    )
  })

  return app
}

const app = createApp()

const CRON_DRAIN = '*/1 * * * *'
const CRON_SWEEP = '*/5 * * * *'

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === CRON_SWEEP) {
      ctx.waitUntil(
        sweepReadyCompleted(env)
          .then((n) =>
            console.log(JSON.stringify({ level: 'info', msg: 'webhook_sweep', enqueued: n })),
          )
          .catch((err) =>
            console.error(
              JSON.stringify({
                level: 'error',
                msg: 'webhook_sweep_failed',
                error: err instanceof Error ? err.message : String(err),
              }),
            ),
          ),
      )
      return
    }

    if (event.cron === CRON_DRAIN || !event.cron) {
      ctx.waitUntil(
        drainDueDeliveries(env)
          .then((n) =>
            console.log(JSON.stringify({ level: 'info', msg: 'webhook_drain', delivered: n })),
          )
          .catch((err) =>
            console.error(
              JSON.stringify({
                level: 'error',
                msg: 'webhook_drain_failed',
                error: err instanceof Error ? err.message : String(err),
              }),
            ),
          ),
      )
    }
  },
}
