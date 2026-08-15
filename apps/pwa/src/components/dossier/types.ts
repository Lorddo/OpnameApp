import type { InspectionTemplate } from '@opnameapp/core'

export type DossierFloor = { id: string; label: string; sort_order: number; property_id?: string }
export type DossierRoom = {
  id: string
  floor_id: string
  room_type: string
  label: string | null
  sort_order: number
  property_id?: string
}
export type DossierObservation = {
  id?: string
  source_observation_id?: string
  inspection_id?: string
  subject_type: string
  subject_id: string
  attribute_key: string
  value: unknown
  updated_at?: string
  observed_at?: string
}
export type DossierPhoto = {
  id: string
  observation_id: string | null
  subject_type?: string | null
  subject_id?: string | null
  storage_key?: string
  source_inspection_id?: string | null
  checksum?: string | null
}
export type DossierInspection = {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  updated_at?: string
  inspection_template_pins?: Array<{ template_key: string; template_version: string }>
}
export type DossierProperty = {
  id?: string
  postcode: string
  house_number: string
  house_number_addition: string | null
  city: string | null
}
export type CompletenessRoom = {
  roomId: string
  isComplete: boolean
  missingAttributeKeys?: string[]
  missingPhotoAttributeKeys?: string[]
}
export type CompletenessEntry = {
  inspectionId?: string
  templateKey: string
  templateVersion: string
  isComplete: boolean
  missingAnswerCount: number
  missingPhotoCount: number
  rooms: CompletenessRoom[]
}
export type DossierPayload = {
  exportedAt: string
  property: DossierProperty
  floors: DossierFloor[]
  rooms: DossierRoom[]
  inspections: DossierInspection[]
  observations: DossierObservation[]
  facts: DossierObservation[]
  photos: DossierPhoto[]
  completeness?: Record<string, CompletenessEntry>
}

export type AnswerRow = {
  observationId: string | null
  attribute_key: string
  value: unknown
}

export type DossierLoadResult = {
  dossier: DossierPayload
  templates: InspectionTemplate[]
  photoPreviewUrls: Record<string, string>
}
