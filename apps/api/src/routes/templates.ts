import { Hono } from 'hono'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { dbForAuth } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'
import { createServiceClient } from '../lib/supabase.js'
import bbmiTemplate from '../seed/bbmi-0.1.0.json'
import { parseInspectionTemplate } from '@opnameapp/core'

export const templatesRoutes = new Hono<AppEnv>()

templatesRoutes.use('*', requireAuth)

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

    const attributeRows = Object.entries(parsed.attributes).map(([attribute_key, attr]) => ({
      attribute_key,
      answer_scope: attr.answerScope,
      question_key: attr.questionKey,
      label: attr.label,
      answer_type: attr.answerType,
      options: attr.options ?? null,
      help_text: attr.helpText ?? null,
      unit: attr.unit ?? null,
      min_value: attr.min ?? null,
      max_value: attr.max ?? null,
      step_value: attr.step ?? null,
    }))
    await service.from('attributes').upsert(attributeRows)
  }
}

templatesRoutes.get('/', async (c) => {
  await ensureSeeded(c.env)
  const db = dbForAuth(c.env, c.get('auth')!)
  const { data, error } = await db
    .from('inspection_templates')
    .select('template_key, version, label, locale, published_at')
    .order('template_key')
    .order('version')

  if (error) throw new ApiError(500, 'db_error', error.message)
  return c.json({ templates: data ?? [] })
})

templatesRoutes.get('/:key/:version', async (c) => {
  await ensureSeeded(c.env)
  const db = dbForAuth(c.env, c.get('auth')!)
  const { data, error } = await db
    .from('inspection_templates')
    .select('template_key, version, label, locale, config, published_at')
    .eq('template_key', c.req.param('key'))
    .eq('version', c.req.param('version'))
    .maybeSingle()

  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!data) throw new ApiError(404, 'not_found', 'Template not found')
  return c.json({ template: data })
})
