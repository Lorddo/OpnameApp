import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../env.js'
import { createServiceClient } from './supabase.js'
import {
  dedupeKeyForCompletedAt,
  evaluateInspectionReadinessFromDb,
  type InspectionPin,
  type InspectionRow,
} from './inspection-readiness.js'

export const WEBHOOK_EVENT_COMPLETED = 'inspection.completed' as const

/** Attempt index → delay before that attempt (attempt 0 = immediate). */
export const WEBHOOK_BACKOFF_MS = [
  0,
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000,
] as const

export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_BACKOFF_MS.length

export type WebhookDeliveryRow = {
  id: string
  event_type: string
  inspection_id: string
  property_id: string
  dedupe_key: string
  payload: WebhookCompletedPayload
  status: 'pending' | 'sending' | 'delivered' | 'failed'
  attempt_count: number
  next_attempt_at: string
  last_status_code: number | null
  last_error: string | null
  delivered_at: string | null
}

export type WebhookCompletedPayload = {
  eventId: string
  type: typeof WEBHOOK_EVENT_COMPLETED
  occurredAt: string
  revision: number
  data: {
    inspectionId: string
    propertyId: string
    completedAt: string
    ownerOrgId: string
    clientOrgId: string | null
    templates: Array<{ templateKey: string; templateVersion: string }>
    photoCount: number
    dossierUrl: string
  }
}

export function webhookConfigured(env: Env): boolean {
  return Boolean(env.WEBHOOK_URL?.trim() && env.WEBHOOK_SECRET?.trim())
}

export function nextAttemptAt(attemptCount: number, from = new Date()): Date | null {
  if (attemptCount >= WEBHOOK_MAX_ATTEMPTS) return null
  const delay = WEBHOOK_BACKOFF_MS[attemptCount] ?? null
  if (delay === null) return null
  return new Date(from.getTime() + delay)
}

export async function signPayload(
  secret: string,
  timestampSec: number,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const data = new TextEncoder().encode(`${timestampSec}.${body}`)
  const sig = await crypto.subtle.sign('HMAC', key, data)
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `t=${timestampSec},v1=${hex}`
}

export function buildCompletedPayload(input: {
  eventId: string
  inspection: InspectionRow
  photoCount: number
  revision: number
  dossierBaseUrl: string
  occurredAt?: string
}): WebhookCompletedPayload {
  const completedAt = input.inspection.completed_at!
  const pins = (input.inspection.inspection_template_pins ?? []) as InspectionPin[]
  const base = input.dossierBaseUrl.replace(/\/$/, '')
  return {
    eventId: input.eventId,
    type: WEBHOOK_EVENT_COMPLETED,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    revision: input.revision,
    data: {
      inspectionId: input.inspection.id,
      propertyId: input.inspection.property_id,
      completedAt,
      ownerOrgId: input.inspection.owner_org_id,
      clientOrgId: input.inspection.client_org_id,
      templates: pins.map((p) => ({
        templateKey: p.template_key,
        templateVersion: p.template_version,
      })),
      photoCount: input.photoCount,
      dossierUrl: `${base}/api/exports/properties/${input.inspection.property_id}/dossier`,
    },
  }
}

async function revisionForInspection(
  db: SupabaseClient,
  inspectionId: string,
): Promise<number> {
  const { count, error } = await db
    .from('webhook_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('inspection_id', inspectionId)
    .eq('event_type', WEBHOOK_EVENT_COMPLETED)
  if (error) throw error
  return (count ?? 0) + 1
}

/**
 * If inspection is ready, insert a delivery row (deduped) and optionally attempt send.
 * No-op when WEBHOOK_URL is unset.
 */
export async function enqueueCompletedEvent(
  env: Env,
  inspectionId: string,
  options?: { attemptImmediate?: boolean },
): Promise<{ enqueued: boolean; deliveryId?: string; reasons?: string[] }> {
  if (!webhookConfigured(env)) {
    return { enqueued: false, reasons: ['webhook_not_configured'] }
  }

  const db = createServiceClient(env)
  const readiness = await evaluateInspectionReadinessFromDb(db, inspectionId)
  if (!readiness) {
    return { enqueued: false, reasons: ['inspection_not_found'] }
  }
  if (!readiness.ready) {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'webhook_not_ready',
        inspectionId,
        reasons: readiness.reasons,
      }),
    )
    return { enqueued: false, reasons: readiness.reasons }
  }

  const completedAt = readiness.inspection.completed_at!
  const dedupeKey = dedupeKeyForCompletedAt(completedAt)
  const eventId = crypto.randomUUID()
  const revision = await revisionForInspection(db, inspectionId)
  const dossierBase =
    env.PUBLIC_API_BASE_URL?.trim() ||
    'https://opnameapp-api.workers.dev'

  const payload = buildCompletedPayload({
    eventId,
    inspection: readiness.inspection,
    photoCount: readiness.photoCount,
    revision,
    dossierBaseUrl: dossierBase,
  })

  const row = {
    id: eventId,
    event_type: WEBHOOK_EVENT_COMPLETED,
    inspection_id: inspectionId,
    property_id: readiness.inspection.property_id,
    dedupe_key: dedupeKey,
    payload,
    status: 'pending' as const,
    attempt_count: 0,
    next_attempt_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('webhook_deliveries')
    .insert(row)
    .select('*')
    .maybeSingle()

  if (error) {
    // Unique violation → already enqueued for this completed_at
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      const existing = await db
        .from('webhook_deliveries')
        .select('*')
        .eq('event_type', WEBHOOK_EVENT_COMPLETED)
        .eq('inspection_id', inspectionId)
        .eq('dedupe_key', dedupeKey)
        .maybeSingle()
      return {
        enqueued: false,
        deliveryId: existing.data?.id as string | undefined,
        reasons: ['already_enqueued'],
      }
    }
    console.error(JSON.stringify({ level: 'error', msg: 'webhook_enqueue_failed', error: error.message }))
    throw error
  }

  const delivery = data as WebhookDeliveryRow | null
  if (!delivery) {
    return { enqueued: false, reasons: ['enqueue_failed'] }
  }

  if (options?.attemptImmediate !== false) {
    await deliver(env, delivery)
  }

  return { enqueued: true, deliveryId: delivery.id }
}

export async function deliver(env: Env, row: WebhookDeliveryRow): Promise<void> {
  if (!webhookConfigured(env)) return

  const db = createServiceClient(env)
  const url = env.WEBHOOK_URL!.trim()
  const secret = env.WEBHOOK_SECRET!.trim()
  const body = JSON.stringify(row.payload)
  const timestampSec = Math.floor(Date.now() / 1000)
  const signature = await signPayload(secret, timestampSec, body)
  const attempt = row.attempt_count + 1

  let statusCode: number | null = null
  let errorText: string | null = null
  let ok = false

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Opname-Event-Id': row.payload.eventId,
        'X-Opname-Event-Type': row.event_type,
        'X-Opname-Attempt': String(attempt),
        'X-Opname-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    statusCode = res.status
    if (res.status >= 200 && res.status < 300) {
      ok = true
    } else if (res.status === 410) {
      errorText = 'gone'
    } else {
      errorText = (await res.text().catch(() => '')) || res.statusText
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err)
  }

  if (ok) {
    await db
      .from('webhook_deliveries')
      .update({
        status: 'delivered',
        attempt_count: attempt,
        last_status_code: statusCode,
        last_error: null,
        delivered_at: new Date().toISOString(),
        next_attempt_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return
  }

  // 410 Gone → permanent fail
  if (statusCode === 410 || attempt >= WEBHOOK_MAX_ATTEMPTS) {
    await db
      .from('webhook_deliveries')
      .update({
        status: 'failed',
        attempt_count: attempt,
        last_status_code: statusCode,
        last_error: errorText?.slice(0, 2000) ?? 'max_attempts',
      })
      .eq('id', row.id)
    return
  }

  const next = nextAttemptAt(attempt)
  await db
    .from('webhook_deliveries')
    .update({
      status: 'pending',
      attempt_count: attempt,
      last_status_code: statusCode,
      last_error: errorText?.slice(0, 2000),
      next_attempt_at: (next ?? new Date()).toISOString(),
    })
    .eq('id', row.id)
}

export async function drainDueDeliveries(env: Env, limit = 20): Promise<number> {
  if (!webhookConfigured(env)) return 0
  const db = createServiceClient(env)

  const { data, error } = await db.rpc('claim_webhook_deliveries', { p_limit: limit })
  // RPC lives in app_private — call via raw SQL if not exposed. Prefer service SQL.
  if (error || !data) {
    // Fallback: claim via update returning without skip locked (single cron worker).
    const due = await db
      .from('webhook_deliveries')
      .select('*')
      .in('status', ['pending', 'sending'])
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(limit)

    if (due.error) {
      console.error(JSON.stringify({ level: 'error', msg: 'webhook_drain_select', error: due.error.message }))
      return 0
    }

    const rows = (due.data ?? []) as WebhookDeliveryRow[]
    for (const row of rows) {
      await db.from('webhook_deliveries').update({ status: 'sending' }).eq('id', row.id)
      await deliver(env, { ...row, status: 'sending' })
    }
    return rows.length
  }

  const rows = data as WebhookDeliveryRow[]
  for (const row of rows) {
    await deliver(env, row)
  }
  return rows.length
}

/**
 * Sweep recently completed inspections that have no delivery yet for their completed_at.
 */
export async function sweepReadyCompleted(env: Env, limit = 50): Promise<number> {
  if (!webhookConfigured(env)) return 0
  const db = createServiceClient(env)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('inspections')
    .select('id, completed_at')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'webhook_sweep', error: error.message }))
    return 0
  }

  let enqueued = 0
  for (const row of data ?? []) {
    const result = await enqueueCompletedEvent(env, row.id as string, { attemptImmediate: false })
    if (result.enqueued) enqueued += 1
  }
  return enqueued
}

export async function replayDelivery(env: Env, deliveryId: string): Promise<WebhookDeliveryRow> {
  const db = createServiceClient(env)
  const { data, error } = await db
    .from('webhook_deliveries')
    .update({
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', deliveryId)
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Delivery not found')
  const row = data as WebhookDeliveryRow
  await deliver(env, row)
  const refreshed = await db.from('webhook_deliveries').select('*').eq('id', deliveryId).single()
  return refreshed.data as WebhookDeliveryRow
}
