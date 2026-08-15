import { formatNlPostcode } from '@opnameapp/core'
import { apiFetch, apiUpload, ApiClientError } from '@/lib/api'
import { db } from './index'
import { getBoundLocalOwner } from './owner'
import { markOutboxAttempt, listReadyOutbox, pendingOutboxCount } from './outbox'
import { emitSyncChange } from './sync-events'
import type { OutboxItem, SyncStatus } from './types'

function backoffMs(attempts: number): number {
  // 1s, 2s, 4s, … capped at 5 min
  return Math.min(1000 * 2 ** Math.max(attempts, 0), 5 * 60 * 1000)
}

function isAlreadyExistsError(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false
  if (err.status === 409) return true
  return /duplicate|unique|already exists|23505/i.test(err.message)
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 404
}

async function setEntitySyncStatus(
  table:
    | 'properties'
    | 'floors'
    | 'rooms'
    | 'assets'
    | 'inspections'
    | 'observations'
    | 'photos',
  id: string,
  syncStatus: SyncStatus,
  extra?: Record<string, unknown>,
) {
  await db.table(table).update(id, { syncStatus, ...extra })
}

async function processItem(item: OutboxItem): Promise<void> {
  switch (item.op) {
    case 'property.upsert': {
      const p = item.payload as {
        id: string
        postcode: string
        houseNumber: string
        houseNumberAddition: string | null
        city?: string | null
        propertyType?: string | null
      }
      try {
        await apiFetch('/api/properties', {
          method: 'POST',
          body: JSON.stringify({
            id: p.id,
            postcode: formatNlPostcode(p.postcode),
            houseNumber: p.houseNumber,
            houseNumberAddition: p.houseNumberAddition,
            city: p.city ?? null,
            propertyType: p.propertyType ?? null,
          }),
        })
      } catch (err) {
        if (!isAlreadyExistsError(err)) throw err
      }
      await setEntitySyncStatus('properties', p.id, 'synced')
      return
    }
    case 'floor.upsert': {
      const f = item.payload as {
        id: string
        propertyId: string
        label: string
        sortOrder: number
      }
      await apiFetch(`/api/properties/${f.propertyId}/floors`, {
        method: 'POST',
        body: JSON.stringify({
          id: f.id,
          label: f.label,
          sortOrder: f.sortOrder,
        }),
      })
      await setEntitySyncStatus('floors', f.id, 'synced')
      return
    }
    case 'floor.delete': {
      const f = item.payload as { id: string; propertyId: string }
      try {
        await apiFetch(`/api/properties/${f.propertyId}/floors/${f.id}`, { method: 'DELETE' })
      } catch (err) {
        if (!isNotFoundError(err)) throw err
      }
      return
    }
    case 'room.upsert': {
      const r = item.payload as {
        id: string
        propertyId: string
        floorId: string
        roomType: string
        label: string | null
        sortOrder: number
      }
      await apiFetch(`/api/properties/${r.propertyId}/rooms`, {
        method: 'POST',
        body: JSON.stringify({
          id: r.id,
          floorId: r.floorId,
          roomType: r.roomType,
          label: r.label,
          sortOrder: r.sortOrder,
        }),
      })
      await setEntitySyncStatus('rooms', r.id, 'synced')
      return
    }
    case 'room.delete': {
      const r = item.payload as { id: string; propertyId: string }
      try {
        await apiFetch(`/api/properties/${r.propertyId}/rooms/${r.id}`, { method: 'DELETE' })
      } catch (err) {
        if (!isNotFoundError(err)) throw err
      }
      return
    }
    case 'asset.upsert': {
      const a = item.payload as {
        id: string
        propertyId: string
        floorId: string | null
        assetType: string
        label: string | null
        sortOrder: number
      }
      await apiFetch(`/api/properties/${a.propertyId}/assets`, {
        method: 'POST',
        body: JSON.stringify({
          id: a.id,
          floorId: a.floorId,
          assetType: a.assetType,
          label: a.label,
          sortOrder: a.sortOrder,
        }),
      })
      await setEntitySyncStatus('assets', a.id, 'synced')
      return
    }
    case 'asset.delete': {
      const a = item.payload as { id: string; propertyId: string }
      try {
        await apiFetch(`/api/properties/${a.propertyId}/assets/${a.id}`, { method: 'DELETE' })
      } catch (err) {
        if (!isNotFoundError(err)) throw err
      }
      return
    }
    case 'inspection.upsert': {
      const i = item.payload as {
        id: string
        propertyId: string
        status: string
        templates: Array<{ templateKey: string; templateVersion: string }>
      }
      try {
        await apiFetch('/api/inspections', {
          method: 'POST',
          body: JSON.stringify({
            id: i.id,
            propertyId: i.propertyId,
            status: i.status,
            templates: i.templates,
          }),
        })
      } catch (err) {
        if (!isAlreadyExistsError(err)) throw err
      }
      await setEntitySyncStatus('inspections', i.id, 'synced', { lastSyncError: null })
      return
    }
    case 'inspection.patch': {
      const i = item.payload as {
        id: string
        status?: string
        completedAt?: string | null
        templates?: Array<{ templateKey: string; templateVersion: string }>
      }
      const patchBody = {
        status: i.status,
        completedAt: i.completedAt,
        templates: i.templates,
      }
      try {
        await apiFetch(`/api/inspections/${i.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        })
      } catch (err) {
        // Create raced ahead of patch, or patch was retried after a failed create.
        if (!isNotFoundError(err)) throw err
        const local = await db.inspections.get(i.id)
        if (!local) throw err
        try {
          await apiFetch('/api/inspections', {
            method: 'POST',
            body: JSON.stringify({
              id: local.id,
              propertyId: local.propertyId,
              status: i.status ?? local.status,
              templates: i.templates ?? local.templates,
            }),
          })
        } catch (createErr) {
          if (!isAlreadyExistsError(createErr)) throw createErr
        }
        await apiFetch(`/api/inspections/${i.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        })
      }
      await setEntitySyncStatus('inspections', i.id, 'synced', { lastSyncError: null })
      return
    }
    case 'observations.batch': {
      const body = item.payload as { observations: Array<{ id: string }> }
      await apiFetch('/api/observations/batch', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      for (const obs of body.observations) {
        await setEntitySyncStatus('observations', obs.id, 'synced')
      }
      return
    }
    case 'photo.meta': {
      const p = item.payload as {
        id: string
        propertyId: string
        observationId: string | null
        subjectType: string | null
        subjectId: string | null
        contentType: string
        checksum: string | null
        sourceInspectionId: string | null
      }
      if (!(await db.photos.get(p.id))) return
      await apiFetch('/api/photos/upload-url', {
        method: 'POST',
        body: JSON.stringify(p),
      })
      await setEntitySyncStatus('photos', p.id, 'pending')
      return
    }
    case 'photo.content': {
      const p = item.payload as { id: string; contentType: string }
      if (!(await db.photos.get(p.id))) return
      const blobRow = await db.photoBlobs.get(p.id)
      if (!blobRow) throw new Error('Local photo blob missing')
      try {
        await apiUpload(`/api/photos/${p.id}/content`, blobRow.blob, p.contentType, 'PUT')
      } catch (err) {
        if (isNotFoundError(err)) return
        throw err
      }
      // Keep local blob after sync (ADR-018); free space via purgePropertyLocal.
      await db.photos.update(p.id, {
        syncStatus: 'synced',
        uploadStatus: 'uploaded',
        hasLocalBlob: true,
      })
      return
    }
    case 'photo.delete': {
      const p = item.payload as { id: string }
      try {
        await apiFetch(`/api/photos/${p.id}`, { method: 'DELETE' })
      } catch (err) {
        if (!isNotFoundError(err)) throw err
      }
      return
    }
    default: {
      const _exhaustive: never = item.op
      throw new Error(`Unknown outbox op: ${_exhaustive}`)
    }
  }
}

let flushing = false
let flushAgain = false

export async function flushOutbox(): Promise<{ processed: number; failed: number; remaining: number }> {
  if (flushing) {
    // Another write landed while we were draining — run one more pass afterwards.
    flushAgain = true
    return { processed: 0, failed: 0, remaining: await pendingOutboxCount() }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: 0, remaining: await pendingOutboxCount() }
  }
  if (!(await getBoundLocalOwner())) {
    return { processed: 0, failed: 0, remaining: await pendingOutboxCount() }
  }

  flushing = true
  let processed = 0
  let failed = 0
  try {
    const items = await listReadyOutbox(30)
    for (const item of items) {
      // Skip if any dependency still in outbox
      if (item.dependsOn.length) {
        const pendingDeps = await db.outbox.where('id').anyOf(item.dependsOn).count()
        if (pendingDeps > 0) continue
      }
      try {
        await processItem(item)
        await markOutboxAttempt(item.id, null, 0)
        processed += 1
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : String(err)
        await markOutboxAttempt(item.id, message, backoffMs(item.attempts))
        if (item.op.startsWith('inspection.') || item.entityId) {
          const tableGuess =
            item.op.startsWith('property')
              ? 'properties'
              : item.op.startsWith('floor')
                ? 'floors'
                : item.op.startsWith('room')
                  ? 'rooms'
                  : item.op.startsWith('asset')
                    ? 'assets'
                    : item.op.startsWith('inspection')
                    ? 'inspections'
                    : item.op.startsWith('observation')
                      ? 'observations'
                      : item.op.startsWith('photo')
                        ? 'photos'
                        : null
          if (tableGuess) {
            await setEntitySyncStatus(tableGuess, item.entityId, 'error')
          }
          if (item.op.startsWith('inspection')) {
            await db.inspections.update(item.entityId, { lastSyncError: message })
          }
        }
      }
    }
  } finally {
    flushing = false
    emitSyncChange()
  }

  if (flushAgain) {
    flushAgain = false
    const again = await flushOutbox()
    return {
      processed: processed + again.processed,
      failed: failed + again.failed,
      remaining: again.remaining,
    }
  }

  return { processed, failed, remaining: await pendingOutboxCount() }
}
