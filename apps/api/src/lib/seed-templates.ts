import { parseInspectionTemplate, type InspectionTemplate } from '@opnameapp/core'
import bbmiTemplate from '../seed/bbmi-0.1.0.json'
import type { Env } from '../env.js'
import { createServiceClient } from './supabase.js'

/** Stable fingerprint so jsonb key-order differences do not retrigger a publish. */
export function templateQuestionSignature(config: unknown): string {
  const roomTypes =
    (config as { roomTypes?: Array<{ id?: string; questions?: Array<Record<string, unknown>> }> })
      ?.roomTypes ?? []
  return JSON.stringify(
    roomTypes.map((rt) => ({
      id: rt.id ?? null,
      questions: (rt.questions ?? []).map((q) => ({
        k: q.attributeKey ?? null,
        o: q.sortOrder ?? null,
        p: q.photoRequired ?? null,
        w: q.showWhen ?? null,
        h: q.helpTextOverride ?? null,
      })),
    })),
  )
}

function attributeRows(parsed: InspectionTemplate) {
  return Object.entries(parsed.attributes).map(([attribute_key, attr]) => ({
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
}

/**
 * Keep the bundled BBMI 0.1.0 row in sync with git.
 * Insert-only seeding left staging on an old config without showWhen.
 * Bump published_at only when the question graph actually changes, so pull cursors move.
 */
export async function ensureSeeded(env: Env) {
  const service = createServiceClient(env)
  const parsed = parseInspectionTemplate(bbmiTemplate)
  const { data } = await service
    .from('inspection_templates')
    .select('id, config')
    .eq('template_key', parsed.id)
    .eq('version', parsed.version)
    .maybeSingle()

  const rows = attributeRows(parsed)

  if (!data) {
    await service.from('inspection_templates').insert({
      template_key: parsed.id,
      version: parsed.version,
      label: parsed.label,
      locale: parsed.locale,
      config: parsed,
      published_at: new Date().toISOString(),
    })
    await service.from('attributes').upsert(rows)
    return
  }

  if (templateQuestionSignature(data.config) === templateQuestionSignature(parsed)) {
    return
  }

  await service
    .from('inspection_templates')
    .update({
      label: parsed.label,
      locale: parsed.locale,
      config: parsed,
      published_at: new Date().toISOString(),
    })
    .eq('id', data.id)

  await service.from('attributes').upsert(rows)
}
