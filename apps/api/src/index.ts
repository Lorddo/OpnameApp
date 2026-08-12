import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from './env.js'
import { healthRoutes } from './routes/health.js'

export type AppVariables = {
  requestId: string
}

export type AppEnv = {
  Bindings: Env
  Variables: AppVariables
}

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

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
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Request-Id',
        'Access-Control-Max-Age': '86400',
      })
    }
    await next()
    c.res.headers.set('Access-Control-Allow-Origin', origin)
    c.res.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Request-Id')
    c.res.headers.set('X-Request-Id', c.get('requestId'))
  })

  app.route('/api', healthRoutes)

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
export default app
