import type { Visibility } from '@opnameapp/core'
import { formatNlPostcode } from '@opnameapp/core'
import { cloneForIdb } from './clone'
import { db } from './index'
import { getDeviceId } from './device-id'
import { newId, nowIso } from './ids'
import { enqueueOutbox } from './outbox'
import { preparePhotoForUpload } from './photo-prepare'
import { emitSyncChange } from './sync-events'
import { flushOutbox } from './sync'
import { isBusySyncStatus } from './sync-status'
import type {
  LocalFloor,
  LocalInspection,
  LocalObservation,
  LocalPhoto,
  LocalProperty,
  LocalRoom,
  OutboxOp,
  SyncStatus,
} from './types'

export { isBusySyncStatus } from './sync-status'

/** Outbox rows still waiting for a given entity (used for dependsOn chaining). */
async function pendingOutboxIdsFor(entityId: string, op?: OutboxOp): Promise<string[]> {
  const rows = await db.outbox.toArray()
  return rows
    .filter((row) => row.entityId === entityId && (op ? row.op === op : true))
    .map((row) => row.id)
}

export async function createPropertyLocal(input: {
  id?: string
  postcode: string
  houseNumber: string
  houseNumberAddition?: string | null
  city?: string | null
}): Promise<LocalProperty> {
  const id = input.id ?? newId()
  const row: LocalProperty = {
    id,
    postcode: formatNlPostcode(input.postcode),
    houseNumber: input.houseNumber,
    houseNumberAddition: input.houseNumberAddition ?? null,
    city: input.city ?? null,
    propertyType: null,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.properties.put(cloneForIdb(row))
  await enqueueOutbox('property.upsert', id, {
    id,
    postcode: row.postcode,
    houseNumber: row.houseNumber,
    houseNumberAddition: row.houseNumberAddition,
    city: row.city,
    propertyType: row.propertyType,
  })
  void flushOutbox()
  return row
}

export async function createInspectionLocal(input: {
  id?: string
  propertyId: string
  status?: string
  templates: Array<{ templateKey: string; templateVersion: string }>
}): Promise<LocalInspection> {
  const id = input.id ?? newId()
  const row: LocalInspection = {
    id,
    propertyId: input.propertyId,
    status: input.status ?? 'in_progress',
    startedAt: nowIso(),
    completedAt: null,
    templates: input.templates.map((t) => ({
      templateKey: t.templateKey,
      templateVersion: t.templateVersion,
    })),
    updatedAt: nowIso(),
    syncStatus: 'pending',
    lastSyncError: null,
  }
  const dependsOn = await pendingOutboxIdsFor(input.propertyId, 'property.upsert')
  await db.inspections.put(cloneForIdb(row))
  await enqueueOutbox(
    'inspection.upsert',
    id,
    {
      id,
      propertyId: row.propertyId,
      status: row.status,
      templates: row.templates,
    },
    dependsOn,
  )
  void flushOutbox()
  return row
}

export async function addFloorLocal(input: {
  id?: string
  propertyId: string
  label: string
  sortOrder: number
}): Promise<LocalFloor> {
  const id = input.id ?? newId()
  const row: LocalFloor = {
    id,
    propertyId: input.propertyId,
    label: input.label,
    sortOrder: input.sortOrder,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  const dependsOn = await pendingOutboxIdsFor(input.propertyId, 'property.upsert')
  await db.floors.put(cloneForIdb(row))
  await enqueueOutbox(
    'floor.upsert',
    id,
    {
      id,
      propertyId: row.propertyId,
      label: row.label,
      sortOrder: row.sortOrder,
    },
    dependsOn,
  )
  void flushOutbox()
  return row
}

export async function removeFloorLocal(propertyId: string, floorId: string) {
  await db.floors.delete(floorId)
  const rooms = await db.rooms.where('floorId').equals(floorId).toArray()
  await db.rooms.bulkDelete(rooms.map((r) => r.id))
  await enqueueOutbox('floor.delete', floorId, { id: floorId, propertyId })
  void flushOutbox()
}

export async function addRoomLocal(input: {
  id?: string
  propertyId: string
  floorId: string
  roomType: string
  label?: string | null
  sortOrder: number
}): Promise<LocalRoom> {
  const id = input.id ?? newId()
  const row: LocalRoom = {
    id,
    propertyId: input.propertyId,
    floorId: input.floorId,
    roomType: input.roomType,
    label: input.label ?? null,
    sortOrder: input.sortOrder,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.rooms.put(cloneForIdb(row))
  const dependsOn = [
    ...(await pendingOutboxIdsFor(input.propertyId, 'property.upsert')),
    ...(await pendingOutboxIdsFor(input.floorId, 'floor.upsert')),
  ]
  await enqueueOutbox(
    'room.upsert',
    id,
    {
      id,
      propertyId: row.propertyId,
      floorId: row.floorId,
      roomType: row.roomType,
      label: row.label,
      sortOrder: row.sortOrder,
    },
    dependsOn,
  )
  void flushOutbox()
  return row
}

export async function removeRoomLocal(propertyId: string, roomId: string) {
  await db.rooms.delete(roomId)
  await enqueueOutbox('room.delete', roomId, { id: roomId, propertyId })
  void flushOutbox()
}

export async function saveObservationsLocal(
  observations: Array<{
    id: string
    propertyId: string
    inspectionId: string
    attributeKey: string
    subjectType: 'property' | 'floor' | 'room' | 'asset'
    subjectId: string
    value: unknown
    visibility?: Visibility
  }>,
): Promise<LocalObservation[]> {
  const deviceId = getDeviceId()
  const updatedAt = nowIso()
  const rows: LocalObservation[] = observations.map((o) => ({
    id: o.id,
    propertyId: o.propertyId,
    inspectionId: o.inspectionId,
    attributeKey: o.attributeKey,
    subjectType: o.subjectType,
    subjectId: o.subjectId,
    value: o.value,
    visibility: o.visibility ?? 'private',
    deviceId,
    updatedAt,
    syncStatus: 'pending',
  }))
  await db.observations.bulkPut(cloneForIdb(rows))
  const inspectionId = observations[0]?.inspectionId ?? newId()
  const roomIds = [
    ...new Set(
      observations.filter((o) => o.subjectType === 'room').map((o) => o.subjectId),
    ),
  ]
  const dependsOn = [
    ...(await pendingOutboxIdsFor(inspectionId, 'inspection.upsert')),
    ...(
      await Promise.all(roomIds.map((roomId) => pendingOutboxIdsFor(roomId, 'room.upsert')))
    ).flat(),
  ]
  await enqueueOutbox(
    'observations.batch',
    inspectionId,
    {
      observations: rows.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        inspectionId: r.inspectionId,
        attributeKey: r.attributeKey,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        value: r.value,
        visibility: r.visibility,
        deviceId: r.deviceId,
      })),
    },
    dependsOn,
  )
  void flushOutbox()
  return rows
}

type InspectionUpsertPayload = {
  id: string
  propertyId: string
  status: string
  templates: Array<{ templateKey: string; templateVersion: string }>
}

async function pendingInspectionUpsert(inspectionId: string) {
  const outbox = await db.outbox.toArray()
  return outbox.find((row) => row.op === 'inspection.upsert' && row.entityId === inspectionId)
}

export async function updateInspectionTemplatesLocal(
  inspectionId: string,
  templates: Array<{ templateKey: string; templateVersion: string }>,
) {
  const next = templates.map((t) => ({
    templateKey: t.templateKey,
    templateVersion: t.templateVersion,
  }))
  await db.inspections.update(inspectionId, {
    templates: next,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  })

  const pendingUpsert = await pendingInspectionUpsert(inspectionId)
  if (pendingUpsert) {
    // Fold into the create — a follow-up patch races if it runs before upsert lands.
    const payload = pendingUpsert.payload as InspectionUpsertPayload
    await db.outbox.update(pendingUpsert.id, {
      payload: cloneForIdb({ ...payload, templates: next }),
    })
    void flushOutbox()
    return
  }

  const dependsOn = await pendingOutboxIdsFor(inspectionId, 'inspection.upsert')
  await enqueueOutbox(
    'inspection.patch',
    inspectionId,
    { id: inspectionId, templates: next },
    dependsOn,
  )
  void flushOutbox()
}

export async function completeInspectionLocal(inspectionId: string, completedAt = nowIso()) {
  await db.inspections.update(inspectionId, {
    status: 'completed',
    completedAt,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  })

  const pendingUpsert = await pendingInspectionUpsert(inspectionId)
  if (pendingUpsert) {
    const payload = pendingUpsert.payload as InspectionUpsertPayload
    await db.outbox.update(pendingUpsert.id, {
      payload: cloneForIdb({ ...payload, status: 'completed' }),
    })
  }

  const dependsOn = await pendingOutboxIdsFor(inspectionId, 'inspection.upsert')
  await enqueueOutbox(
    'inspection.patch',
    inspectionId,
    {
      id: inspectionId,
      status: 'completed',
      completedAt,
    },
    dependsOn,
  )
  void flushOutbox()
}

export async function reopenInspectionLocal(inspectionId: string) {
  await db.inspections.update(inspectionId, {
    status: 'in_progress',
    completedAt: null,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  })

  const pendingUpsert = await pendingInspectionUpsert(inspectionId)
  if (pendingUpsert) {
    const payload = pendingUpsert.payload as InspectionUpsertPayload
    await db.outbox.update(pendingUpsert.id, {
      payload: cloneForIdb({ ...payload, status: 'in_progress' }),
    })
  }

  const dependsOn = await pendingOutboxIdsFor(inspectionId, 'inspection.upsert')
  await enqueueOutbox(
    'inspection.patch',
    inspectionId,
    {
      id: inspectionId,
      status: 'in_progress',
      completedAt: null,
    },
    dependsOn,
  )
  void flushOutbox()
}

export async function savePhotoLocal(input: {
  id?: string
  propertyId: string
  observationId: string | null
  subjectType: 'property' | 'floor' | 'room' | 'asset' | null
  subjectId: string | null
  sourceInspectionId: string | null
  file: File | Blob
  contentType?: string
}): Promise<LocalPhoto> {
  const id = input.id ?? newId()
  const prepared = await preparePhotoForUpload(input.file)
  const contentType = input.contentType ?? prepared.contentType
  const updatedAt = nowIso()
  const row: LocalPhoto = {
    id,
    propertyId: input.propertyId,
    observationId: input.observationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    sourceInspectionId: input.sourceInspectionId,
    contentType,
    checksum: prepared.checksum,
    hasLocalBlob: true,
    storageKey: null,
    updatedAt,
    syncStatus: 'pending',
    uploadStatus: 'pending',
  }

  const metaOutboxId = newId()
  const contentOutboxId = newId()
  const metaDependsOn = [
    ...(input.sourceInspectionId
      ? await pendingOutboxIdsFor(input.sourceInspectionId, 'inspection.upsert')
      : []),
    ...(input.sourceInspectionId
      ? await pendingOutboxIdsFor(input.sourceInspectionId, 'observations.batch')
      : []),
    ...(input.observationId ? await pendingOutboxIdsFor(input.observationId) : []),
  ]
  await db.transaction('rw', db.photos, db.photoBlobs, db.outbox, async () => {
    await db.photos.put(cloneForIdb(row))
    await db.photoBlobs.put({ photoId: id, blob: prepared.blob })
    await db.outbox.put(
      cloneForIdb({
        id: metaOutboxId,
        op: 'photo.meta' as const,
        entityId: id,
        payload: {
          id,
          propertyId: row.propertyId,
          observationId: row.observationId,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          contentType,
          checksum: prepared.checksum,
          sourceInspectionId: row.sourceInspectionId,
        },
        dependsOn: metaDependsOn,
        createdAt: updatedAt,
        attempts: 0,
        nextAttemptAt: updatedAt,
        lastError: null,
      }),
    )
    await db.outbox.put(
      cloneForIdb({
        id: contentOutboxId,
        op: 'photo.content' as const,
        entityId: id,
        payload: { id, contentType },
        dependsOn: [metaOutboxId],
        createdAt: updatedAt,
        attempts: 0,
        nextAttemptAt: updatedAt,
        lastError: null,
      }),
    )
  })
  emitSyncChange()
  void flushOutbox()
  return row
}

export async function getLocalInspectionBundle(inspectionId: string) {
  const inspection = await db.inspections.get(inspectionId)
  if (!inspection) return null
  const property = await db.properties.get(inspection.propertyId)
  const floors = await db.floors.where('propertyId').equals(inspection.propertyId).toArray()
  const rooms = await db.rooms.where('propertyId').equals(inspection.propertyId).toArray()
  const observations = await db.observations.where('inspectionId').equals(inspectionId).toArray()
  const photos = await db.photos.where('sourceInspectionId').equals(inspectionId).toArray()
  return { inspection, property, floors, rooms, observations, photos }
}

/** All local rows for a property (dossier fallback when the export API is unavailable). */
export async function getLocalPropertyBundle(propertyId: string) {
  const property = await db.properties.get(propertyId)
  if (!property) return null
  const [floors, rooms, inspections, observations, photos] = await Promise.all([
    db.floors.where('propertyId').equals(propertyId).toArray(),
    db.rooms.where('propertyId').equals(propertyId).toArray(),
    db.inspections.where('propertyId').equals(propertyId).toArray(),
    db.observations.where('propertyId').equals(propertyId).toArray(),
    db.photos.where('propertyId').equals(propertyId).toArray(),
  ])
  return { property, floors, rooms, inspections, observations, photos }
}

/**
 * Cache server/dossier structure into IndexedDB without enqueueing outbox ops.
 * Skips rows that still have local pending/error writes.
 */
export async function cacheSyncedStructureLocal(input: {
  floors?: LocalFloor[]
  rooms?: LocalRoom[]
  observations?: LocalObservation[]
  photos?: LocalPhoto[]
}) {
  async function putIdle<T extends { id: string }>(
    table: 'floors' | 'rooms' | 'observations' | 'photos',
    row: T,
  ) {
    const existing = await db.table(table).get(row.id)
    if (isBusySyncStatus((existing as { syncStatus?: SyncStatus } | undefined)?.syncStatus)) return
    await db.table(table).put(cloneForIdb(row))
  }

  for (const row of input.floors ?? []) await putIdle('floors', row)
  for (const row of input.rooms ?? []) await putIdle('rooms', row)
  for (const row of input.observations ?? []) await putIdle('observations', row)
  for (const row of input.photos ?? []) await putIdle('photos', row)
}

/**
 * Remove local project working data for a property from IndexedDB (device only).
 * Does not call the API / does not delete server or R2 objects.
 * Photos + photoBlobs are kept on device (ADR-018).
 */
export async function purgePropertyLocal(propertyId: string) {
  const [floors, rooms, inspections, observations, outbox] = await Promise.all([
    db.floors.where('propertyId').equals(propertyId).toArray(),
    db.rooms.where('propertyId').equals(propertyId).toArray(),
    db.inspections.where('propertyId').equals(propertyId).toArray(),
    db.observations.where('propertyId').equals(propertyId).toArray(),
    db.outbox.toArray(),
  ])

  const entityIds = new Set<string>([
    propertyId,
    ...floors.map((f) => f.id),
    ...rooms.map((r) => r.id),
    ...inspections.map((i) => i.id),
    ...observations.map((o) => o.id),
  ])
  // Drop structure/queue ops only — never photo.meta / photo.content outbox or blobs.
  const outboxIds = outbox
    .filter((row) => entityIds.has(row.entityId) && !row.op.startsWith('photo.'))
    .map((row) => row.id)

  await db.transaction(
    'rw',
    [db.properties, db.floors, db.rooms, db.inspections, db.observations, db.outbox],
    async () => {
      if (observations.length) await db.observations.bulkDelete(observations.map((o) => o.id))
      if (inspections.length) await db.inspections.bulkDelete(inspections.map((i) => i.id))
      if (rooms.length) await db.rooms.bulkDelete(rooms.map((r) => r.id))
      if (floors.length) await db.floors.bulkDelete(floors.map((f) => f.id))
      await db.properties.delete(propertyId)
      if (outboxIds.length) await db.outbox.bulkDelete(outboxIds)
    },
  )

  emitSyncChange()
}
