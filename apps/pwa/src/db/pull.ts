import { apiFetch } from '@/lib/api'
import { cloneForIdb } from './clone'
import { db } from './index'
import type { LocalInspection, LocalProperty, LocalTemplate, SyncStatus } from './types'

const CURSOR_TEMPLATES = 'pull.cursor.templates'
const CURSOR_PROPERTIES = 'pull.cursor.properties'
const CURSOR_INSPECTIONS = 'pull.cursor.inspections'

type PullResponse = {
  serverTime: string
  templates: Array<{
    template_key: string
    version: string
    label: string
    locale: string
    config: unknown
    published_at: string | null
  }>
  properties: Array<{
    id: string
    postcode: string
    house_number: string
    house_number_addition: string | null
    city: string | null
    property_type: string | null
    updated_at: string
  }>
  inspections: Array<{
    id: string
    property_id: string
    status: string
    started_at: string | null
    completed_at: string | null
    updated_at: string
    inspection_template_pins?: Array<{ template_key: string; template_version: string }>
  }>
  cursors: {
    templates: string | null
    properties: string | null
    inspections: string | null
  }
  truncated: {
    templates: boolean
    properties: boolean
    inspections: boolean
  }
}

async function getCursor(key: string): Promise<string | null> {
  const row = await db.syncMeta.get(key)
  return row?.value ?? null
}

async function setCursor(key: string, value: string | null) {
  if (!value) return
  await db.syncMeta.put({ key, value })
}

function shouldApplyServer(localUpdatedAt: string | undefined, serverUpdatedAt: string, localSync?: SyncStatus) {
  // Pending local writes win until pushed (outbox is source of truth).
  if (localSync === 'pending' || localSync === 'error' || localSync === 'draft') return false
  if (!localUpdatedAt) return true
  return serverUpdatedAt >= localUpdatedAt
}

async function applyTemplates(rows: PullResponse['templates']) {
  for (const row of rows) {
    const id = `${row.template_key}@${row.version}`
    const local: LocalTemplate = {
      id,
      templateKey: row.template_key,
      version: row.version,
      label: row.label,
      locale: row.locale,
      config: row.config,
      updatedAt: row.published_at ?? new Date().toISOString(),
    }
    await db.templates.put(cloneForIdb(local))
  }
}

async function applyProperties(rows: PullResponse['properties']) {
  for (const row of rows) {
    const existing = await db.properties.get(row.id)
    if (!shouldApplyServer(existing?.updatedAt, row.updated_at, existing?.syncStatus)) continue
    const local: LocalProperty = {
      id: row.id,
      postcode: row.postcode,
      houseNumber: row.house_number,
      houseNumberAddition: row.house_number_addition,
      city: row.city,
      propertyType: row.property_type,
      updatedAt: row.updated_at,
      syncStatus: 'synced',
    }
    await db.properties.put(cloneForIdb(local))
  }
}

async function applyInspections(rows: PullResponse['inspections']) {
  for (const row of rows) {
    const existing = await db.inspections.get(row.id)
    if (!shouldApplyServer(existing?.updatedAt, row.updated_at, existing?.syncStatus)) continue
    const local: LocalInspection = {
      id: row.id,
      propertyId: row.property_id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      templates: (row.inspection_template_pins ?? []).map((p) => ({
        templateKey: p.template_key,
        templateVersion: p.template_version,
      })),
      updatedAt: row.updated_at,
      syncStatus: 'synced',
      lastSyncError: null,
    }
    await db.inspections.put(cloneForIdb(local))
  }
}

/**
 * Pull remote changes into Dexie. Safe to call while online after push.
 * Does not overwrite local pending/error rows (LWW within device until synced).
 */
export async function pullRemote(): Promise<{
  templates: number
  properties: number
  inspections: number
  truncated: boolean
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { templates: 0, properties: 0, inspections: 0, truncated: false }
  }

  const sinceTemplates = await getCursor(CURSOR_TEMPLATES)
  const sinceProperties = await getCursor(CURSOR_PROPERTIES)
  const sinceInspections = await getCursor(CURSOR_INSPECTIONS)

  const params = new URLSearchParams()
  if (sinceTemplates) params.set('sinceTemplates', sinceTemplates)
  if (sinceProperties) params.set('sinceProperties', sinceProperties)
  if (sinceInspections) params.set('sinceInspections', sinceInspections)

  const qs = params.toString()
  const data = await apiFetch<PullResponse>(`/api/sync/pull${qs ? `?${qs}` : ''}`)

  await applyTemplates(data.templates)
  await applyProperties(data.properties)
  await applyInspections(data.inspections)

  await setCursor(CURSOR_TEMPLATES, data.cursors.templates)
  await setCursor(CURSOR_PROPERTIES, data.cursors.properties)
  await setCursor(CURSOR_INSPECTIONS, data.cursors.inspections)

  const truncated =
    data.truncated.templates || data.truncated.properties || data.truncated.inspections

  // If truncated, caller may invoke pullRemote again to catch up.
  return {
    templates: data.templates.length,
    properties: data.properties.length,
    inspections: data.inspections.length,
    truncated,
  }
}
