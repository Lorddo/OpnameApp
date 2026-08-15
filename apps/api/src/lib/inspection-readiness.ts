import {
  attributeQuestionKey,
  evaluateTemplateCompleteness,
  parseInspectionTemplate,
  type InspectionTemplate,
  type RoomAnswers,
  type TemplateCompleteness,
} from '@opnameapp/core'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ReadinessReason =
  | 'not_completed'
  | 'missing_answers'
  | 'missing_photos'
  | 'photos_not_uploaded'
  | 'no_template_pins'
  | 'template_not_found'

export type InspectionPin = {
  template_key: string
  template_version: string
}

export type InspectionRow = {
  id: string
  property_id: string
  owner_org_id: string
  client_org_id: string | null
  status: string
  completed_at: string | null
  inspection_template_pins?: InspectionPin[] | null
}

export type ObservationRow = {
  id: string
  subject_id: string
  attribute_key: string
  value: unknown
  inspection_id?: string
}

export type PhotoRow = {
  id: string
  observation_id: string | null
  source_inspection_id?: string | null
  uploaded_at?: string | null
}

export type RoomRow = {
  id: string
  room_type: string
}

export type ReadinessResult = {
  ready: boolean
  reasons: ReadinessReason[]
  completeness: TemplateCompleteness[]
  photoCount: number
  pendingUploadCount: number
}

/** Build room answer + photo count maps scoped to one inspection's observations/photos. */
export function buildCompletenessMaps(
  rooms: RoomRow[],
  observations: ObservationRow[],
  photos: PhotoRow[],
): {
  answersByRoomId: Record<string, RoomAnswers>
  photosByRoomId: Record<string, Record<string, number>>
} {
  const obsById = new Map(observations.map((o) => [o.id, o]))
  const answersByRoomId: Record<string, RoomAnswers> = {}
  const photosByRoomId: Record<string, Record<string, number>> = {}

  for (const room of rooms) {
    const answers: RoomAnswers = {}
    for (const obs of observations) {
      if (obs.subject_id !== room.id) continue
      const key = attributeQuestionKey(String(obs.attribute_key))
      if (key) answers[key] = obs.value
    }
    answersByRoomId[room.id] = answers

    const photosByAttribute: Record<string, number> = {}
    for (const photo of photos) {
      if (!photo.observation_id) continue
      const obs = obsById.get(photo.observation_id)
      if (!obs || obs.subject_id !== room.id) continue
      const attr = String(obs.attribute_key)
      photosByAttribute[attr] = (photosByAttribute[attr] ?? 0) + 1
    }
    photosByRoomId[room.id] = photosByAttribute
  }

  return { answersByRoomId, photosByRoomId }
}

export function evaluateInspectionReadiness(input: {
  inspection: InspectionRow
  rooms: RoomRow[]
  observations: ObservationRow[]
  photos: PhotoRow[]
  templates: InspectionTemplate[]
}): ReadinessResult {
  const reasons: ReadinessReason[] = []
  const pins = input.inspection.inspection_template_pins ?? []

  if (input.inspection.status !== 'completed' || !input.inspection.completed_at) {
    reasons.push('not_completed')
  }

  if (pins.length === 0) {
    reasons.push('no_template_pins')
  }

  const pendingUploadCount = input.photos.filter((p) => !p.uploaded_at).length
  if (pendingUploadCount > 0) {
    reasons.push('photos_not_uploaded')
  }

  const { answersByRoomId, photosByRoomId } = buildCompletenessMaps(
    input.rooms,
    input.observations,
    input.photos,
  )

  const roomInputs = input.rooms.map((r) => ({ id: r.id, roomType: r.room_type }))
  const completeness: TemplateCompleteness[] = []
  const templateByKey = new Map(
    input.templates.map((t) => [`${t.id}@${t.version}`, t] as const),
  )

  for (const pin of pins) {
    const template = templateByKey.get(`${pin.template_key}@${pin.template_version}`)
    if (!template) {
      reasons.push('template_not_found')
      continue
    }
    const result = evaluateTemplateCompleteness(
      template,
      roomInputs,
      answersByRoomId,
      photosByRoomId,
    )
    completeness.push(result)
    if (result.missingAnswerCount > 0) reasons.push('missing_answers')
    if (result.missingPhotoCount > 0) reasons.push('missing_photos')
  }

  const uniqueReasons = [...new Set(reasons)]
  return {
    ready: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    completeness,
    photoCount: input.photos.length,
    pendingUploadCount,
  }
}

export function dedupeKeyForCompletedAt(completedAt: string): string {
  return completedAt
}

/** Load inspection bundle scoped like PWA getLocalInspectionBundle. */
export async function loadInspectionReadinessBundle(
  db: SupabaseClient,
  inspectionId: string,
): Promise<{
  inspection: InspectionRow
  rooms: RoomRow[]
  observations: ObservationRow[]
  photos: PhotoRow[]
  templates: InspectionTemplate[]
} | null> {
  const { data: inspection, error } = await db
    .from('inspections')
    .select(
      'id, property_id, owner_org_id, client_org_id, status, completed_at, inspection_template_pins(template_key, template_version)',
    )
    .eq('id', inspectionId)
    .maybeSingle()

  if (error) throw error
  if (!inspection) return null

  const propertyId = inspection.property_id as string
  const pins = (inspection.inspection_template_pins ?? []) as InspectionPin[]

  const [roomsRes, obsRes, photosRes] = await Promise.all([
    db.from('rooms').select('id, room_type').eq('property_id', propertyId),
    db
      .from('observations')
      .select('id, subject_id, attribute_key, value, inspection_id')
      .eq('inspection_id', inspectionId),
    db
      .from('photos')
      .select('id, observation_id, source_inspection_id, uploaded_at')
      .eq('source_inspection_id', inspectionId),
  ])

  if (roomsRes.error) throw roomsRes.error
  if (obsRes.error) throw obsRes.error
  if (photosRes.error) throw photosRes.error

  const templates: InspectionTemplate[] = []
  for (const pin of pins) {
    const { data: templateRow, error: tErr } = await db
      .from('inspection_templates')
      .select('config')
      .eq('template_key', pin.template_key)
      .eq('version', pin.template_version)
      .maybeSingle()
    if (tErr) throw tErr
    if (templateRow?.config) {
      templates.push(parseInspectionTemplate(templateRow.config))
    }
  }

  return {
    inspection: inspection as InspectionRow,
    rooms: (roomsRes.data ?? []) as RoomRow[],
    observations: (obsRes.data ?? []) as ObservationRow[],
    photos: (photosRes.data ?? []) as PhotoRow[],
    templates,
  }
}

export async function evaluateInspectionReadinessFromDb(
  db: SupabaseClient,
  inspectionId: string,
): Promise<(ReadinessResult & { inspection: InspectionRow }) | null> {
  const bundle = await loadInspectionReadinessBundle(db, inspectionId)
  if (!bundle) return null
  const result = evaluateInspectionReadiness(bundle)
  return { ...result, inspection: bundle.inspection }
}
