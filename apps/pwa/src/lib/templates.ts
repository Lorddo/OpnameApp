import { parseInspectionTemplate, type InspectionTemplate } from '@opnameapp/core'
import { apiFetch } from '@/lib/api'
import { db } from '@/db'
import { cloneForIdb } from '@/db/clone'

export type TemplatePin = { templateKey: string; templateVersion: string }

/** Fetch published template configs (API first, Dexie cache on failure) and refresh the local cache. */
export async function loadTemplateConfigs(pins: TemplatePin[]): Promise<InspectionTemplate[]> {
  const configs: InspectionTemplate[] = []
  for (const pin of pins) {
    const cacheId = `${pin.templateKey}@${pin.templateVersion}`
    try {
      const res = await apiFetch<{
        template: {
          template_key: string
          version: string
          label: string
          locale: string
          config: unknown
        }
      }>(`/api/templates/${pin.templateKey}/${pin.templateVersion}`)
      configs.push(parseInspectionTemplate(res.template.config))
      await db.templates.put(
        cloneForIdb({
          id: cacheId,
          templateKey: res.template.template_key ?? pin.templateKey,
          version: res.template.version ?? pin.templateVersion,
          label: res.template.label ?? pin.templateKey,
          locale: res.template.locale ?? 'nl',
          config: res.template.config,
          updatedAt: new Date().toISOString(),
        }),
      )
    } catch (err) {
      const cached = await db.templates.get(cacheId)
      if (!cached) throw err
      configs.push(parseInspectionTemplate(cached.config))
    }
  }
  return configs
}
