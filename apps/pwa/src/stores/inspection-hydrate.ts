/** Pure helpers for loading an existing inspection into the flow (dossier / resume). */

import { attributeQuestionKey, observationMapKey, subjectAnswerKey } from '@opnameapp/core'
import { getDeviceId } from '@/db/device-id'
import { nowIso } from '@/db/ids'
import { isBusySyncStatus } from '@/db/sync-status'
import type {
  LocalFloor,
  LocalInspection,
  LocalObservation,
  LocalPhoto,
  LocalProperty,
  LocalRoom,
} from '@/db/types'

export { attributeQuestionKey, observationMapKey as obsMapKey, subjectAnswerKey }

export type ObservationLike = {
  id?: string
  source_observation_id?: string
  inspection_id?: string
  inspectionId?: string
  subject_type?: string
  subjectType?: string
  subject_id?: string
  subjectId?: string
  attribute_key?: string
  attributeKey?: string
  value: unknown
  updated_at?: string
  visibility?: string
  device_id?: string | null
  property_id?: string
}

export type InspectionDossierPayload = {
  property: {
    id?: string
    postcode: string
    house_number: string
    house_number_addition: string | null
    city?: string | null
  }
  floors: Array<{
    id: string
    label: string
    sort_order: number
    updated_at?: string
    property_id?: string
  }>
  rooms: Array<{
    id: string
    floor_id: string
    room_type: string
    label: string | null
    sort_order?: number
    updated_at?: string
    property_id?: string
  }>
  inspections: Array<{
    id: string
    status: string
    started_at?: string | null
    completed_at?: string | null
    updated_at?: string
    inspection_template_pins?: Array<{ template_key: string; template_version: string }>
  }>
  observations: ObservationLike[]
  facts?: ObservationLike[]
  photos: Array<{
    id: string
    observation_id: string | null
    subject_id?: string | null
    subject_type?: string | null
    source_inspection_id?: string | null
    checksum?: string | null
    storage_key?: string
  }>
}

export type LocalInspectionBundle = {
  inspection: LocalInspection
  property: LocalProperty | undefined
  floors: LocalFloor[]
  rooms: LocalRoom[]
  observations: LocalObservation[]
  photos: LocalPhoto[]
}

export type HydratePhotoRef = {
  id: string
  subjectType: LocalObservation['subjectType']
  subjectId: string
  attributeKey: string
  observationId: string | null
}

/** Common local-ish shape used by hydrateFlowFromBundle. */
export type HydrateBundle = {
  inspectionId: string
  propertyId: string | null
  status: string
  templates: Array<{ templateKey: string; templateVersion: string }>
  postcode: string
  houseNumber: string
  houseNumberAddition: string
  floors: Array<{ id: string; label: string; sortOrder: number }>
  rooms: Array<{ id: string; floorId: string; roomType: string; label: string | null }>
  answersBySubject: Record<string, Record<string, unknown>>
  observationIdsByKey: Record<string, string>
  photos: HydratePhotoRef[]
  structureToCache?: {
    floors: LocalFloor[]
    rooms: LocalRoom[]
    observations: LocalObservation[]
    photos: LocalPhoto[]
  }
}

export type ApiResumePayload = {
  inspection: {
    id: string
    property_id: string
    status: string
    inspection_template_pins?: Array<{ template_key: string; template_version: string }>
  }
  structure: {
    property: {
      postcode: string
      house_number: string
      house_number_addition: string | null
    }
    floors: Array<{ id: string; label: string; sort_order: number; updated_at?: string }>
    rooms: Array<{
      id: string
      floor_id: string
      room_type: string
      label: string | null
      sort_order?: number
      updated_at?: string
    }>
  }
  observations: ObservationLike[]
  photos: Array<{
    id: string
    observation_id: string | null
    subject_id: string | null
    subject_type?: string | null
    source_inspection_id: string | null
    checksum?: string | null
    storage_key?: string | null
  }>
}

export function bundleHasStructure(
  floors: Array<unknown> | undefined,
  rooms: Array<unknown> | undefined,
) {
  return (floors?.length ?? 0) > 0 && (rooms?.length ?? 0) > 0
}

export function chooseFlowStep(input: {
  status: string
  hasStructure: boolean
  keepStructureStep: boolean
  editing: boolean
}): 2 | 3 | 4 {
  if (!input.editing && (input.status === 'completed' || input.status === 'synced')) {
    return 4
  }
  if (!input.hasStructure || input.keepStructureStep) return 2
  return 3
}

export function shouldPreferLocalBundle(input: {
  online: boolean
  hasStructure: boolean
  syncStatus?: string | null
}) {
  if (!input.hasStructure) return false
  if (!input.online) return true
  return isBusySyncStatus(input.syncStatus)
}

export function observationsForInspection(rows: ObservationLike[], inspectionId: string) {
  const matching = rows.filter((row) => {
    const id = row.inspection_id ?? row.inspectionId
    return !id || id === inspectionId
  })
  return matching.length ? matching : rows
}

export function answersFromObservations(rows: ObservationLike[]) {
  const bySubject: Record<string, Record<string, unknown>> = {}
  const obsIds: Record<string, string> = {}
  for (const obs of rows) {
    const subjectType = obs.subject_type ?? obs.subjectType
    if (!isSubjectType(subjectType)) continue
    const subjectId = String(obs.subject_id ?? obs.subjectId ?? '')
    const attributeKey = String(obs.attribute_key ?? obs.attributeKey ?? '')
    const id = obs.id ?? obs.source_observation_id
    if (!subjectId || !attributeKey) continue
    const mapKey = observationMapKey(subjectType, subjectId, attributeKey)
    if (id && !obsIds[mapKey]) obsIds[mapKey] = id
    const questionKey = attributeQuestionKey(attributeKey)
    const subjectKey = subjectAnswerKey(subjectType, subjectId)
    if (!bySubject[subjectKey]) bySubject[subjectKey] = {}
    if (!(questionKey in bySubject[subjectKey]!)) {
      bySubject[subjectKey]![questionKey] = obs.value
    }
  }
  return { bySubject, obsIds }
}

/** Observations win over facts for the same question; facts fill gaps. */
export function answersFromDossier(dossier: InspectionDossierPayload, inspectionId: string) {
  const fromObs = answersFromObservations(
    observationsForInspection(dossier.observations ?? [], inspectionId),
  )
  const fromFacts = answersFromObservations(dossier.facts ?? [])
  const bySubject: Record<string, Record<string, unknown>> = { ...fromFacts.bySubject }
  const obsIds: Record<string, string> = { ...fromFacts.obsIds }
  for (const [subjectKey, answers] of Object.entries(fromObs.bySubject)) {
    bySubject[subjectKey] = { ...(bySubject[subjectKey] ?? {}), ...answers }
  }
  for (const [key, id] of Object.entries(fromObs.obsIds)) {
    obsIds[key] = id
  }
  return { bySubject, obsIds }
}

function isSubjectType(value: unknown): value is LocalObservation['subjectType'] {
  return value === 'property' || value === 'floor' || value === 'room' || value === 'asset'
}

function photosFromLocal(
  photos: LocalPhoto[],
  observations: LocalObservation[],
): HydratePhotoRef[] {
  const loaded: HydratePhotoRef[] = []
  for (const row of photos) {
    if (!row.observationId) continue
    const obs = observations.find((o) => o.id === row.observationId)
    if (!obs) continue
    loaded.push({
      id: row.id,
      subjectType: obs.subjectType,
      subjectId: obs.subjectId,
      attributeKey: obs.attributeKey,
      observationId: row.observationId,
    })
  }
  return loaded
}

function photosFromLinkedRows(
  photos: Array<{
    id: string
    observation_id: string | null
    subject_id?: string | null
    subject_type?: string | null
  }>,
  obsById: Map<string, ObservationLike>,
): HydratePhotoRef[] {
  const loaded: HydratePhotoRef[] = []
  for (const row of photos) {
    const obs = row.observation_id ? obsById.get(row.observation_id) : undefined
    const subjectTypeRaw = obs?.subject_type ?? obs?.subjectType ?? row.subject_type
    const subjectType = isSubjectType(subjectTypeRaw) ? subjectTypeRaw : 'room'
    const subjectId = String(obs?.subject_id ?? obs?.subjectId ?? row.subject_id ?? '')
    const attributeKey = String(obs?.attribute_key ?? obs?.attributeKey ?? '')
    if (!subjectId || !attributeKey) continue
    loaded.push({
      id: row.id,
      subjectType,
      subjectId,
      attributeKey,
      observationId: row.observation_id,
    })
  }
  return loaded
}

export function hydrateBundleFromLocal(local: LocalInspectionBundle): HydrateBundle | null {
  if (!local.inspection || !local.property) return null
  const mapped = answersFromObservations(local.observations)
  return {
    inspectionId: local.inspection.id,
    propertyId: local.inspection.propertyId,
    status: local.inspection.status,
    templates: local.inspection.templates,
    postcode: local.property.postcode,
    houseNumber: local.property.houseNumber,
    houseNumberAddition: local.property.houseNumberAddition ?? '',
    floors: local.floors
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({ id: f.id, label: f.label, sortOrder: f.sortOrder })),
    rooms: local.rooms.map((r) => ({
      id: r.id,
      floorId: r.floorId,
      roomType: r.roomType,
      label: r.label,
    })),
    answersBySubject: mapped.bySubject,
    observationIdsByKey: mapped.obsIds,
    photos: photosFromLocal(local.photos, local.observations),
  }
}

export function hydrateBundleFromDossier(
  targetInspectionId: string,
  dossier: InspectionDossierPayload,
  local?: LocalInspectionBundle | null,
): HydrateBundle | null {
  const inspection =
    dossier.inspections.find((row) => row.id === targetInspectionId) ?? dossier.inspections[0]
  if (!inspection) return null

  const propertyId =
    local?.inspection?.propertyId ??
    local?.property?.id ??
    dossier.property.id ??
    dossier.floors[0]?.property_id ??
    dossier.rooms[0]?.property_id ??
    null

  let templates = (inspection.inspection_template_pins ?? []).map((p) => ({
    templateKey: p.template_key,
    templateVersion: p.template_version,
  }))
  if (!templates.length && local?.inspection?.templates.length) {
    templates = local.inspection.templates
  }

  const floors = [...dossier.floors]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({ id: f.id, label: f.label, sortOrder: f.sort_order }))
  const rooms = dossier.rooms.map((r) => ({
    id: r.id,
    floorId: r.floor_id,
    roomType: r.room_type,
    label: r.label,
  }))

  const mapped = answersFromDossier(dossier, inspection.id)
  const obsRows = observationsForInspection(dossier.observations ?? [], inspection.id)
  const obsById = new Map(
    [...obsRows, ...(dossier.facts ?? [])]
      .filter((o) => o.id || o.source_observation_id)
      .map((o) => [String(o.id ?? o.source_observation_id), o]),
  )

  const bundle: HydrateBundle = {
    inspectionId: inspection.id,
    propertyId,
    status: inspection.status,
    templates,
    postcode: dossier.property.postcode,
    houseNumber: dossier.property.house_number,
    houseNumberAddition: dossier.property.house_number_addition ?? '',
    floors,
    rooms,
    answersBySubject: mapped.bySubject,
    observationIdsByKey: mapped.obsIds,
    photos: photosFromLinkedRows(dossier.photos ?? [], obsById),
  }

  if (propertyId) {
    const cachedAt = nowIso()
    const deviceId = getDeviceId()
    const floorById = new Map(dossier.floors.map((f) => [f.id, f]))
    const roomById = new Map(dossier.rooms.map((r) => [r.id, r]))
    bundle.structureToCache = {
      floors: floors.map((f) => ({
        id: f.id,
        propertyId,
        label: f.label,
        sortOrder: f.sortOrder,
        updatedAt: floorById.get(f.id)?.updated_at ?? cachedAt,
        syncStatus: 'synced',
      })),
      rooms: rooms.map((r, index) => ({
        id: r.id,
        propertyId,
        floorId: r.floorId,
        roomType: r.roomType,
        label: r.label,
        sortOrder: roomById.get(r.id)?.sort_order ?? index,
        updatedAt: roomById.get(r.id)?.updated_at ?? cachedAt,
        syncStatus: 'synced',
      })),
      observations: obsRows.flatMap((o) => {
        const id = o.id ?? o.source_observation_id
        const subjectType = o.subject_type ?? o.subjectType
        const subjectId = o.subject_id ?? o.subjectId
        const attributeKey = o.attribute_key ?? o.attributeKey
        if (!id || !subjectType || !subjectId || !attributeKey) return []
        if (!isSubjectType(subjectType)) return []
        return [
          {
            id,
            propertyId,
            inspectionId: inspection.id,
            attributeKey: String(attributeKey),
            subjectType,
            subjectId: String(subjectId),
            value: o.value,
            visibility: 'private' as const,
            deviceId,
            updatedAt: o.updated_at ?? cachedAt,
            syncStatus: 'synced' as const,
          },
        ]
      }),
      photos: (dossier.photos ?? []).map((p) => ({
        id: p.id,
        propertyId,
        observationId: p.observation_id,
        subjectType: (p.subject_type as LocalPhoto['subjectType']) ?? 'room',
        subjectId: p.subject_id ?? null,
        sourceInspectionId: p.source_inspection_id ?? inspection.id,
        contentType: 'image/jpeg',
        checksum: p.checksum ?? null,
        hasLocalBlob: false,
        storageKey: p.storage_key ?? null,
        updatedAt: cachedAt,
        syncStatus: 'synced' as const,
        uploadStatus: 'uploaded' as const,
      })),
    }
  }

  return bundle
}

export function hydrateBundleFromApi(payload: ApiResumePayload): HydrateBundle {
  const { inspection, structure, observations, photos } = payload
  const floors = (structure.floors ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({ id: f.id, label: f.label, sortOrder: f.sort_order }))
  const rooms = (structure.rooms ?? []).map((r) => ({
    id: r.id,
    floorId: r.floor_id,
    roomType: r.room_type,
    label: r.label,
  }))
  const mapped = answersFromObservations(observations ?? [])
  const obsById = new Map((observations ?? []).map((o) => [String(o.id), o]))
  const cachedAt = nowIso()
  const deviceId = getDeviceId()

  return {
    inspectionId: inspection.id,
    propertyId: inspection.property_id,
    status: inspection.status,
    templates: (inspection.inspection_template_pins ?? []).map((p) => ({
      templateKey: p.template_key,
      templateVersion: p.template_version,
    })),
    postcode: structure.property.postcode,
    houseNumber: structure.property.house_number,
    houseNumberAddition: structure.property.house_number_addition ?? '',
    floors,
    rooms,
    answersBySubject: mapped.bySubject,
    observationIdsByKey: mapped.obsIds,
    photos: photosFromLinkedRows(photos ?? [], obsById),
    structureToCache: {
      floors: floors.map((f) => ({
        id: f.id,
        propertyId: inspection.property_id,
        label: f.label,
        sortOrder: f.sortOrder,
        updatedAt: cachedAt,
        syncStatus: 'synced',
      })),
      rooms: rooms.map((r, index) => ({
        id: r.id,
        propertyId: inspection.property_id,
        floorId: r.floorId,
        roomType: r.roomType,
        label: r.label,
        sortOrder: structure.rooms?.[index]?.sort_order ?? index,
        updatedAt: cachedAt,
        syncStatus: 'synced',
      })),
      observations: (observations ?? []).flatMap((o) => {
        const subjectType = o.subject_type ?? o.subjectType
        const id = o.id
        if (!id || !isSubjectType(subjectType)) return []
        return [
          {
            id,
            propertyId: o.property_id ?? inspection.property_id,
            inspectionId: o.inspection_id ?? o.inspectionId ?? inspection.id,
            attributeKey: String(o.attribute_key ?? o.attributeKey ?? ''),
            subjectType,
            subjectId: String(o.subject_id ?? o.subjectId ?? ''),
            value: o.value,
            visibility: (o.visibility as LocalObservation['visibility']) ?? 'private',
            deviceId: o.device_id ?? deviceId,
            updatedAt: o.updated_at ?? cachedAt,
            syncStatus: 'synced' as const,
          },
        ]
      }),
      photos: (photos ?? []).map((p) => ({
        id: p.id,
        propertyId: inspection.property_id,
        observationId: p.observation_id,
        subjectType: (p.subject_type as LocalPhoto['subjectType']) ?? 'room',
        subjectId: p.subject_id,
        sourceInspectionId: p.source_inspection_id ?? inspection.id,
        contentType: 'image/jpeg',
        checksum: p.checksum ?? null,
        hasLocalBlob: false,
        storageKey: p.storage_key ?? null,
        updatedAt: cachedAt,
        syncStatus: 'synced' as const,
        uploadStatus: 'uploaded' as const,
      })),
    },
  }
}

/** Map Dexie property rows into the dossier payload shape used by DossierView / resume. */
export function localPropertyToDossierPayload(input: {
  property: LocalProperty
  floors: LocalFloor[]
  rooms: LocalRoom[]
  inspections: LocalInspection[]
  observations: LocalObservation[]
  photos: LocalPhoto[]
}): InspectionDossierPayload {
  return {
    property: {
      id: input.property.id,
      postcode: input.property.postcode,
      house_number: input.property.houseNumber,
      house_number_addition: input.property.houseNumberAddition,
      city: input.property.city,
    },
    floors: input.floors.map((f) => ({
      id: f.id,
      label: f.label,
      sort_order: f.sortOrder,
      property_id: f.propertyId,
      updated_at: f.updatedAt,
    })),
    rooms: input.rooms.map((r) => ({
      id: r.id,
      floor_id: r.floorId,
      room_type: r.roomType,
      label: r.label,
      sort_order: r.sortOrder,
      property_id: r.propertyId,
      updated_at: r.updatedAt,
    })),
    inspections: input.inspections.map((i) => ({
      id: i.id,
      status: i.status,
      started_at: i.startedAt,
      completed_at: i.completedAt,
      updated_at: i.updatedAt,
      inspection_template_pins: i.templates.map((t) => ({
        template_key: t.templateKey,
        template_version: t.templateVersion,
      })),
    })),
    observations: input.observations.map((o) => ({
      id: o.id,
      inspection_id: o.inspectionId,
      subject_type: o.subjectType,
      subject_id: o.subjectId,
      attribute_key: o.attributeKey,
      value: o.value,
      updated_at: o.updatedAt,
    })),
    facts: [],
    photos: input.photos.map((p) => ({
      id: p.id,
      observation_id: p.observationId,
      subject_type: p.subjectType,
      subject_id: p.subjectId,
      source_inspection_id: p.sourceInspectionId,
      checksum: p.checksum,
      storage_key: p.storageKey ?? undefined,
    })),
  }
}
