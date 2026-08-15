/**
 * Local IndexedDB entity shapes (camelCase). Server payloads stay snake_case at the API boundary.
 */

import type { Visibility } from '@opnameapp/core'

export type SyncStatus = 'draft' | 'pending' | 'synced' | 'error'

export type LocalProperty = {
  id: string
  postcode: string
  houseNumber: string
  houseNumberAddition: string | null
  city: string | null
  propertyType: string | null
  updatedAt: string
  syncStatus: SyncStatus
}

export type LocalFloor = {
  id: string
  propertyId: string
  label: string
  sortOrder: number
  updatedAt: string
  syncStatus: SyncStatus
}

export type LocalRoom = {
  id: string
  propertyId: string
  floorId: string
  roomType: string
  label: string | null
  sortOrder: number
  updatedAt: string
  syncStatus: SyncStatus
}

export type LocalAsset = {
  id: string
  propertyId: string
  floorId: string | null
  assetType: string
  label: string | null
  sortOrder: number
  updatedAt: string
  syncStatus: SyncStatus
}

export type LocalInspection = {
  id: string
  propertyId: string
  status: string
  startedAt: string | null
  completedAt: string | null
  templates: Array<{ templateKey: string; templateVersion: string }>
  updatedAt: string
  syncStatus: SyncStatus
  lastSyncError: string | null
}

export type LocalObservation = {
  id: string
  propertyId: string
  inspectionId: string
  attributeKey: string
  subjectType: 'property' | 'floor' | 'room' | 'asset'
  subjectId: string
  value: unknown
  visibility: Visibility
  deviceId: string
  updatedAt: string
  syncStatus: SyncStatus
}

export type LocalPhoto = {
  id: string
  propertyId: string
  observationId: string | null
  subjectType: 'property' | 'floor' | 'room' | 'asset' | null
  subjectId: string | null
  sourceInspectionId: string | null
  contentType: string
  checksum: string | null
  /** Local blob present in photoBlobs (kept after upload — ADR-018). */
  hasLocalBlob: boolean
  storageKey: string | null
  updatedAt: string
  syncStatus: SyncStatus
  uploadStatus: 'pending' | 'uploaded' | 'error'
}

export type LocalPhotoBlob = {
  photoId: string
  blob: Blob
}

export type LocalTemplate = {
  /** `${templateKey}@${version}` */
  id: string
  templateKey: string
  version: string
  label: string
  locale: string
  config: unknown
  updatedAt: string
}

export type OutboxOp =
  | 'property.upsert'
  | 'floor.upsert'
  | 'floor.delete'
  | 'room.upsert'
  | 'room.delete'
  | 'asset.upsert'
  | 'asset.delete'
  | 'inspection.upsert'
  | 'inspection.patch'
  | 'observations.batch'
  | 'photo.meta'
  | 'photo.content'

export type OutboxItem = {
  id: string
  op: OutboxOp
  entityId: string
  payload: unknown
  dependsOn: string[]
  createdAt: string
  attempts: number
  nextAttemptAt: string
  lastError: string | null
}

export type SyncMeta = {
  key: string
  value: string
}
