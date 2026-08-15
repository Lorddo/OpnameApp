import { parseInspectionTemplate, type InspectionTemplate } from '@opnameapp/core'
import bbmiV010 from '../../../../templates/bbmi/bbmi-0.1.0.json'
import bbmiV100 from '../../../../templates/bbmi/bbmi-1.0.0.json'
import wwsV010 from '../../../../templates/wws/wws-0.1.0.json'
import wwsV100 from '../../../../templates/wws/wws-1.0.0.json'
import epawV010 from '../../../../templates/epaw/epaw-0.1.0.json'
import type { Env } from '../env.js'
import { createServiceClient } from './supabase.js'

/** Stable fingerprint so jsonb key-order differences do not retrigger a publish. */
export function templateQuestionSignature(config: unknown): string {
  const roomTypes =
    (config as { roomTypes?: Array<{ id?: string; questions?: Array<Record<string, unknown>> }> })
      ?.roomTypes ?? []
  const assetTypes =
    (config as { assetTypes?: Array<{ id?: string; questions?: Array<Record<string, unknown>> }> })
      ?.assetTypes ?? []
  const propertyQuestions =
    (config as { propertyQuestions?: Array<Record<string, unknown>> }).propertyQuestions ?? []
  const questionSig = (q: Record<string, unknown>) => ({
    k: q.attributeKey ?? null,
    o: q.sortOrder ?? null,
    p: q.photoRequired ?? null,
    pw: q.photoRequiredWhen ?? null,
    w: q.showWhen ?? null,
    h: q.helpTextOverride ?? null,
  })
  return JSON.stringify({
    propertyQuestions: propertyQuestions.map(questionSig),
    roomTypes: roomTypes.map((rt) => ({
      id: rt.id ?? null,
      questions: (rt.questions ?? []).map(questionSig),
    })),
    assetTypes: assetTypes.map((at) => ({
      id: at.id ?? null,
      questions: (at.questions ?? []).map(questionSig),
    })),
  })
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

type SeedMode = 'insert-only' | 'upsert-if-changed'

/**
 * Historical pins stay insert-only so already-pinned inspections keep their snapshot.
 * BBMI 1.0.0, WWS 1.0.0 and EPA-w 0.1.0 may be updated while staging still iterates.
 */
const SEEDED_TEMPLATES: Array<{ json: unknown; mode: SeedMode }> = [
  { json: bbmiV010, mode: 'insert-only' },
  { json: bbmiV100, mode: 'upsert-if-changed' },
  { json: wwsV010, mode: 'insert-only' },
  { json: wwsV100, mode: 'upsert-if-changed' },
  { json: epawV010, mode: 'upsert-if-changed' },
]

async function seedTemplate(env: Env, json: unknown, mode: SeedMode): Promise<InspectionTemplate> {
  const service = createServiceClient(env)
  const parsed = parseInspectionTemplate(json)
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
    return parsed
  }

  if (mode === 'insert-only') return parsed
  if (templateQuestionSignature(data.config) === templateQuestionSignature(parsed)) {
    return parsed
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
  return parsed
}

export async function ensureSeeded(env: Env) {
  for (const entry of SEEDED_TEMPLATES) {
    await seedTemplate(env, entry.json, entry.mode)
  }
}
