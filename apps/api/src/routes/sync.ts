import { Hono } from 'hono'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'
import { createServiceClient } from '../lib/supabase.js'
import bbmiTemplate from '../seed/bbmi-0.1.0.json'
import { parseInspectionTemplate } from '@opnameapp/core'

export const syncRoutes = new Hono<AppEnv>()
syncRoutes.use('*', requireAuth)

async function ensureSeeded(env: AppEnv['Bindings']) {
  const service = createServiceClient(env)
  const parsed = parseInspectionTemplate(bbmiTemplate)
  const { data } = await service
    .from('inspection_templates')
    .select('id')
    .eq('template_key', parsed.id)
    .eq('version', parsed.version)
    .maybeSingle()

  if (!data) {
    await service.from('inspection_templates').insert({
      template_key: parsed.id,
      version: parsed.version,
      label: parsed.label,
      locale: parsed.locale,
      config: parsed,
      published_at: new Date().toISOString(),
    })
  }
}

/**
 * Incremental pull for offline clients.
 * Query: sinceTemplates / sinceProperties / sinceInspections (ISO timestamps, exclusive).
 */
syncRoutes.get('/pull', async (c) => {
  await ensureSeeded(c.env)
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)

  const sinceTemplates = c.req.query('sinceTemplates')
  const sinceProperties = c.req.query('sinceProperties')
  const sinceInspections = c.req.query('sinceInspections')
  const limit = Math.min(Number(c.req.query('limit') ?? 200), 500)

  let templatesQuery = db
    .from('inspection_templates')
    .select('template_key, version, label, locale, config, published_at')
    .order('published_at', { ascending: true })
    .limit(limit)
  if (sinceTemplates) templatesQuery = templatesQuery.gt('published_at', sinceTemplates)

  let propertiesQuery = db
    .from('properties')
    .select(
      'id, home_org_id, created_by_org_id, postcode, house_number, house_number_addition, city, property_type, updated_at',
    )
    .or(`home_org_id.eq.${auth.orgId},created_by_org_id.eq.${auth.orgId}`)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (sinceProperties) propertiesQuery = propertiesQuery.gt('updated_at', sinceProperties)

  let inspectionsQuery = db
    .from('inspections')
    .select(
      'id, property_id, owner_org_id, client_org_id, inspector_id, assigned_user_id, status, started_at, completed_at, updated_at, inspection_template_pins(template_key, template_version)',
    )
    .eq('owner_org_id', auth.orgId)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (sinceInspections) inspectionsQuery = inspectionsQuery.gt('updated_at', sinceInspections)

  // Inspectors primarily care about their assignments; org admins still get org-wide via RLS/org filter.
  if (auth.kind === 'user' && auth.userId && auth.orgRole === 'inspector') {
    inspectionsQuery = inspectionsQuery.or(
      `assigned_user_id.eq.${auth.userId},inspector_id.eq.${auth.userId}`,
    )
  }

  const [templates, properties, inspections] = await Promise.all([
    templatesQuery,
    propertiesQuery,
    inspectionsQuery,
  ])

  if (templates.error) throw new ApiError(500, 'db_error', templates.error.message)
  if (properties.error) throw new ApiError(500, 'db_error', properties.error.message)
  if (inspections.error) throw new ApiError(500, 'db_error', inspections.error.message)

  const templateRows = templates.data ?? []
  const propertyRows = properties.data ?? []
  const inspectionRows = inspections.data ?? []

  const nextCursors = {
    templates: templateRows.length
      ? String(templateRows[templateRows.length - 1]!.published_at)
      : (sinceTemplates ?? null),
    properties: propertyRows.length
      ? String(propertyRows[propertyRows.length - 1]!.updated_at)
      : (sinceProperties ?? null),
    inspections: inspectionRows.length
      ? String(inspectionRows[inspectionRows.length - 1]!.updated_at)
      : (sinceInspections ?? null),
  }

  return c.json({
    serverTime: new Date().toISOString(),
    templates: templateRows,
    properties: propertyRows,
    inspections: inspectionRows,
    cursors: nextCursors,
    truncated: {
      templates: templateRows.length >= limit,
      properties: propertyRows.length >= limit,
      inspections: inspectionRows.length >= limit,
    },
  })
})
