import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch } from '@/lib/api'
import { db } from '@/db'
import { purgePropertyLocal } from '@/db/repository'
import { flushOutbox } from '@/db/sync'

export type TemplateSummary = {
  template_key: string
  version: string
  label: string
  locale: string
}

export type PropertyRow = {
  id: string
  postcode: string
  house_number: string
  house_number_addition: string | null
  city: string | null
  updated_at: string
}

export type InspectionRow = {
  id: string
  property_id: string
  status: string
  updated_at: string
  sync_status?: string
  inspection_template_pins?: Array<{ template_key: string; template_version: string }>
}

export const useProjectsStore = defineStore('projects', () => {
  const properties = ref<PropertyRow[]>([])
  const inspections = ref<InspectionRow[]>([])
  const templates = ref<TemplateSummary[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function mergeLocalInspections(remote: InspectionRow[]) {
    const local = await db.inspections.toArray()
    const byId = new Map(remote.map((i) => [i.id, i]))
    for (const row of local) {
      const existing = byId.get(row.id)
      if (!existing) {
        byId.set(row.id, {
          id: row.id,
          property_id: row.propertyId,
          status: row.status,
          updated_at: row.updatedAt,
          sync_status: row.syncStatus,
          inspection_template_pins: row.templates.map((t) => ({
            template_key: t.templateKey,
            template_version: t.templateVersion,
          })),
        })
        continue
      }
      byId.set(row.id, {
        ...existing,
        sync_status: row.syncStatus,
        status: row.status || existing.status,
        updated_at:
          row.updatedAt > existing.updated_at ? row.updatedAt : existing.updated_at,
      })
    }
    return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }

  async function mergeLocalProperties(remote: PropertyRow[]) {
    const local = await db.properties.toArray()
    const byId = new Map(remote.map((p) => [p.id, p]))
    for (const row of local) {
      if (byId.has(row.id)) continue
      byId.set(row.id, {
        id: row.id,
        postcode: row.postcode,
        house_number: row.houseNumber,
        house_number_addition: row.houseNumberAddition,
        city: row.city,
        updated_at: row.updatedAt,
      })
    }
    return [...byId.values()]
  }

  /** Refresh in-memory lists from Dexie after pull (avoids a second API list fetch). */
  async function loadFromLocal() {
    const localInspections = await db.inspections.toArray()
    const localProperties = await db.properties.toArray()
    const cachedTemplates = await db.templates.toArray()
    properties.value = localProperties.map((p) => ({
      id: p.id,
      postcode: p.postcode,
      house_number: p.houseNumber,
      house_number_addition: p.houseNumberAddition,
      city: p.city,
      updated_at: p.updatedAt,
    }))
    inspections.value = localInspections
      .map((row) => ({
        id: row.id,
        property_id: row.propertyId,
        status: row.status,
        updated_at: row.updatedAt,
        sync_status: row.syncStatus,
        inspection_template_pins: row.templates.map((t) => ({
          template_key: t.templateKey,
          template_version: t.templateVersion,
        })),
      }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    templates.value = cachedTemplates.map((t) => ({
      template_key: t.templateKey,
      version: t.version,
      label: t.label,
      locale: t.locale,
    }))
  }

  async function loadAll() {
    loading.value = true
    error.value = null
    try {
      void flushOutbox()
      if (!navigator.onLine) {
        await loadFromLocal()
        return
      }

      const [p, i, t] = await Promise.all([
        apiFetch<{ properties: PropertyRow[] }>('/api/properties'),
        apiFetch<{ inspections: InspectionRow[] }>('/api/inspections'),
        apiFetch<{ templates: TemplateSummary[] }>('/api/templates'),
      ])
      properties.value = await mergeLocalProperties(p.properties)
      inspections.value = await mergeLocalInspections(i.inspections)
      templates.value = t.templates
    } catch (err) {
      // Prefer local list over a hard failure when offline / API down.
      try {
        const localInspections = await db.inspections.toArray()
        if (localInspections.length) {
          await loadFromLocal()
          error.value = null
          return
        }
      } catch {
        // fall through
      }
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const publishedTemplates = computed(() => {
    const latest = new Map<string, TemplateSummary>()
    for (const tpl of templates.value) {
      const existing = latest.get(tpl.template_key)
      if (
        !existing ||
        tpl.version.localeCompare(existing.version, undefined, { numeric: true }) > 0
      ) {
        latest.set(tpl.template_key, tpl)
      }
    }
    return [...latest.values()]
  })

  async function removeLocalProperty(propertyId: string) {
    await purgePropertyLocal(propertyId)
    inspections.value = inspections.value.filter((i) => i.property_id !== propertyId)
    properties.value = properties.value.filter((p) => p.id !== propertyId)
  }

  return {
    properties,
    inspections,
    templates,
    publishedTemplates,
    loading,
    error,
    loadAll,
    loadFromLocal,
    removeLocalProperty,
  }
})
