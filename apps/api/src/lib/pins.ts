import type { SupabaseClient } from '@supabase/supabase-js'
import { throwIfDbError } from './db-result.js'

export type TemplatePinInput = { templateKey: string; templateVersion: string }

/** Upsert pins; optionally delete pins whose template_key is no longer present. */
export async function writeTemplatePins(
  db: SupabaseClient,
  inspectionId: string,
  templates: TemplatePinInput[],
  mode: 'insert' | 'upsert' | 'replace' = 'upsert',
) {
  const rows = templates.map((t) => ({
    inspection_id: inspectionId,
    template_key: t.templateKey,
    template_version: t.templateVersion,
  }))

  if (mode === 'replace') {
    const { data: existing, error: existingError } = await db
      .from('inspection_template_pins')
      .select('id, template_key')
      .eq('inspection_id', inspectionId)
    throwIfDbError(existingError, 400)

    const nextKeys = new Set(templates.map((t) => t.templateKey))
    const toDelete = (existing ?? []).filter((row) => !nextKeys.has(row.template_key as string))
    if (toDelete.length) {
      const { error: deleteError } = await db
        .from('inspection_template_pins')
        .delete()
        .in(
          'id',
          toDelete.map((row) => row.id as string),
        )
      throwIfDbError(deleteError, 400)
    }
  }

  if (mode === 'insert') {
    const { error } = await db.from('inspection_template_pins').insert(rows)
    throwIfDbError(error, 400)
    return
  }

  const { error } = await db.from('inspection_template_pins').upsert(rows, {
    onConflict: 'inspection_id,template_key',
  })
  throwIfDbError(error, 400)
}
