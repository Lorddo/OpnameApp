import Dexie, { type EntityTable } from 'dexie'
import type {
  LocalAsset,
  LocalFloor,
  LocalInspection,
  LocalObservation,
  LocalPhoto,
  LocalPhotoBlob,
  LocalProperty,
  LocalRoom,
  LocalTemplate,
  OutboxItem,
  SyncMeta,
} from './types'

export class OpnameDB extends Dexie {
  properties!: EntityTable<LocalProperty, 'id'>
  floors!: EntityTable<LocalFloor, 'id'>
  rooms!: EntityTable<LocalRoom, 'id'>
  assets!: EntityTable<LocalAsset, 'id'>
  inspections!: EntityTable<LocalInspection, 'id'>
  observations!: EntityTable<LocalObservation, 'id'>
  photos!: EntityTable<LocalPhoto, 'id'>
  photoBlobs!: EntityTable<LocalPhotoBlob, 'photoId'>
  templates!: EntityTable<LocalTemplate, 'id'>
  outbox!: EntityTable<OutboxItem, 'id'>
  syncMeta!: EntityTable<SyncMeta, 'key'>

  constructor() {
    super('opnameapp')
    this.version(1).stores({
      properties: 'id, updatedAt, syncStatus',
      floors: 'id, propertyId, updatedAt, syncStatus',
      rooms: 'id, propertyId, floorId, updatedAt, syncStatus',
      inspections: 'id, propertyId, status, updatedAt, syncStatus',
      observations: 'id, propertyId, inspectionId, subjectId, attributeKey, updatedAt, syncStatus',
      photos: 'id, propertyId, observationId, sourceInspectionId, syncStatus, uploadStatus',
      photoBlobs: 'photoId',
      templates: 'id, templateKey, version',
      outbox: 'id, op, nextAttemptAt, createdAt',
      syncMeta: 'key',
    })
    this.version(2).stores({
      assets: 'id, propertyId, floorId, updatedAt, syncStatus',
    })
  }
}

export const db = new OpnameDB()
