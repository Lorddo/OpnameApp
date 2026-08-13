import { Hono } from 'hono'
import type { Env } from './env.js'
import { ApiError } from './lib/errors.js'
import type { AuthContext } from './lib/auth.js'
import { healthRoutes } from './routes/health.js'
import { templatesRoutes } from './routes/templates.js'
import { propertiesRoutes } from './routes/properties.js'
import { inspectionsRoutes } from './routes/inspections.js'
import { observationsRoutes } from './routes/observations.js'
import { factsRoutes } from './routes/facts.js'
import { photosRoutes } from './routes/photos.js'
import { exportsRoutes } from './routes/exports.js'
import { meRoutes } from './routes/me.js'
import { adminRoutes } from './routes/admin.js'
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

function openApiDocument() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'OpnameApp API',
      version: '0.1.0',
      description: 'Vastgoed Opname Platform API (fase 1 online-first)',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Dashboard API key (opk_...)',
        },
      },
    },
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    paths: {
      '/health': { get: { security: [], summary: 'Health check' } },
      '/me': { get: { summary: 'Current auth context' } },
      '/templates': { get: { summary: 'List templates' } },
      '/templates/{key}/{version}': { get: { summary: 'Get template config' } },
      '/properties': {
        get: { summary: 'List properties' },
        post: { summary: 'Create property' },
      },
      '/properties/{id}': { get: { summary: 'Property with structure' } },
      '/inspections': {
        get: { summary: 'List inspections' },
        post: { summary: 'Create inspection with template pins' },
      },
      '/observations/batch': { post: { summary: 'Batch upsert observations' } },
      '/facts': { get: { summary: 'List facts for property' } },
      '/photos': { get: { summary: 'List photos for a property' } },
      '/photos/upload-url': { post: { summary: 'Create photo metadata + upload target' } },
      '/photos/{id}/content': {
        put: { summary: 'Upload photo bytes to R2' },
        get: { summary: 'Download photo bytes from R2' },
      },
      '/exports/properties/{id}/dossier': { get: { summary: 'JSON dossier export' } },
      '/sync/pull': {
        get: { summary: 'Incremental pull (templates, properties, inspections) with cursors' },
      },
      '/assignments': { post: { summary: 'Assign property to inspection org' } },
      '/admin/provision-inspector': {
        post: {
          summary: 'Provision org (optional) + invite/link user + app_metadata + org_members',
        },
      },
      '/admin/assign-inspection': {
        post: {
          summary: 'Create property + inspection (+ pins) for dashboard dispatch',
        },
      },
    },
  }
}

const app = createApp()
export default app
