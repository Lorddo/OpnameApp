export function openApiDocument() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'OpnameApp API',
      version: '0.2.0',
      description: 'Vastgoed Opname Platform API',
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
      '/me': { get: { summary: 'Current auth context + organization' } },
      '/admin/organizations': {
        get: { summary: 'List organizations in the caller tenant (platform only)' },
      },
      '/admin/webhooks/status': {
        get: { summary: 'Webhook readiness + delivery history for an inspection' },
      },
      '/admin/webhooks/{id}/replay': {
        post: { summary: 'Replay a webhook delivery' },
      },
      '/templates': { get: { summary: 'List templates' } },
      '/templates/{key}/{version}': { get: { summary: 'Get template config' } },
      '/properties': {
        get: { summary: 'List properties' },
        post: { summary: 'Create property' },
      },
      '/properties/{id}': { get: { summary: 'Property with structure' } },
      '/inspections': {
        get: {
          summary: 'List inspections',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'updatedSince', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
        },
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
